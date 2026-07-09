// NOTE: SSH credentials and Gemini key should be rotated because they were historically exposed in git.
// The following environment variables must be defined in your deployment environment:
// - DEPLOY_SSH_HOST
// - DEPLOY_SSH_USER
// - DEPLOY_SSH_PASSWORD
// - GEMINI_API_KEY

const { Client } = require('ssh2');
const conn = new Client();

const DEPLOY_SSH_HOST = process.env.DEPLOY_SSH_HOST;
const DEPLOY_SSH_USER = process.env.DEPLOY_SSH_USER;
const DEPLOY_SSH_PASSWORD = process.env.DEPLOY_SSH_PASSWORD;
const geminiKey = process.env.GEMINI_API_KEY;

const missing = [];
if (!DEPLOY_SSH_HOST) missing.push("DEPLOY_SSH_HOST");
if (!DEPLOY_SSH_USER) missing.push("DEPLOY_SSH_USER");
if (!DEPLOY_SSH_PASSWORD) missing.push("DEPLOY_SSH_PASSWORD");
if (!geminiKey) missing.push("GEMINI_API_KEY");

if (missing.length > 0) {
  console.error(`Error: Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

conn.on('ready', () => {
  console.log('SSH connection established for RAG upgrades deployment...');
  
  const setupSwapAndBuild = `
    cd /var/www/proposal-engine
    
    # 1. Force match origin/main exactly to pull latest code
    git fetch origin
    git reset --hard origin/main
    git clean -fxd
    
    # 2. Run Database SQL Migration (pipe migration.sql into db container psql)
    echo "Running PostgreSQL database migration..."
    docker exec -i proposal_engine_db psql -U courseat -d proposal_engine < scripts/migration.sql
    docker exec -i proposal_engine_db psql -U courseat -d proposal_engine < scripts/02_memory_schemas.sql
    docker exec -i proposal_engine_db psql -U courseat -d proposal_engine < scripts/03_pptx_template_schema.sql
    docker exec -i proposal_engine_db psql -U courseat -d proposal_engine < scripts/04_judge_metrics_schema.sql
    
    # 3. Free up disk space from old dangling docker assets
    echo "Pruning unused Docker assets..."
    docker system prune -a -f
    
    # 4. Build and restart Next.js app container
    export GEMINI_API_KEY="${geminiKey}"
    docker-compose build app
    
    echo "Removing old container to prevent docker-compose KeyError..."
    docker rm -f proposal_engine_app || true
    docker-compose up -d app
    
    # Wait for the container to start up (approx 5-10 seconds)
    echo "Waiting for app container to start..."
    sleep 8
    
    # 5. Run backfill migration script inside container to segment existing proposals
    echo "Copying backfill script into container..."
    docker cp scripts/migrate_existing.js proposal_engine_app:/app/migrate_existing.js
    echo "Running backfill segment migration..."
    docker exec -i proposal_engine_app node migrate_existing.js
    echo "Cleaning up temp files..."
    docker exec -u root -i proposal_engine_app rm -f migrate_existing.js
  `;

  console.log('Starting remote build, database migration, and container recreation...');
  
  conn.exec(setupSwapAndBuild, (err, stream) => {
    if (err) {
      console.error('Command execution failed:', err.message);
      conn.end();
      return;
    }
    
    stream.on('close', (code) => {
      console.log(`\nDeployment script finished with exit code ${code}`);
      
      // Check compose status
      conn.exec('cd /var/www/proposal-engine && docker-compose ps', (err2, stream2) => {
        let psOutput = '';
        stream2.on('close', () => {
          console.log('\n--- ACTIVE SERVICES ---');
          console.log(psOutput);
          conn.end();
        }).on('data', (data) => {
          psOutput += data.toString();
        });
      });
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).connect({
  host: DEPLOY_SSH_HOST,
  port: 22,
  username: DEPLOY_SSH_USER,
  password: DEPLOY_SSH_PASSWORD
});
