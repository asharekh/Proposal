const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connection established for deep host cleanup...');
  
  const hostCleanup = `
    echo "=== DISK SPACE BEFORE ==="
    df -h
    
    echo "=== 1. VACUUMING SYSTEM JOURNAL LOGS ==="
    journalctl --vacuum-time=1d
    
    echo "=== 2. CLEANING PACKAGE CACHE ==="
    apt-get clean
    
    echo "=== 3. PRUNING DOCKER BUILD CACHE ==="
    docker builder prune -a -f
    
    echo "=== 4. PRUNING ALL UNUSED DOCKER OBJECTS ==="
    docker system prune -a --volumes -f
    
    echo "=== DISK SPACE AFTER ==="
    df -h
  `;

  console.log('Starting deep disk space cleanup...');
  
  conn.exec(hostCleanup, (err, stream) => {
    if (err) {
      console.error('Command execution failed:', err.message);
      conn.end();
      return;
    }
    
    stream.on('close', (code) => {
      console.log(`\nCleanup finished with exit code ${code}`);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).connect({
  host: '165.245.247.183',
  port: 22,
  username: 'root',
  password: 'ujsf.SRQGUhrpn3$1v'
});
