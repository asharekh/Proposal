const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('Testing bulk exports for all proposals...');
  
  const testScript = `
    echo "=== Proposal 1 (PMP) - DOCX ==="
    curl -o /dev/null -s -w "%{http_code}\n" "http://localhost:3000/api/export?id=b087ebd2-658a-420c-b14c-e0775eca77ea&format=docx"
    
    echo "=== Proposal 1 (PMP) - PPTX ==="
    curl -o /dev/null -s -w "%{http_code}\n" "http://localhost:3000/api/export?id=b087ebd2-658a-420c-b14c-e0775eca77ea&format=pptx"
    
    echo "=== Proposal 2 (Leadership) - DOCX ==="
    curl -o /dev/null -s -w "%{http_code}\n" "http://localhost:3000/api/export?id=01f7e21e-4af7-4a0b-a735-c88146aa1a55&format=docx"
    
    echo "=== Proposal 2 (Leadership) - PPTX ==="
    curl -o /dev/null -s -w "%{http_code}\n" "http://localhost:3000/api/export?id=01f7e21e-4af7-4a0b-a735-c88146aa1a55&format=pptx"
  `;

  conn.exec(testScript, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => conn.end())
          .on('data', d => process.stdout.write(d))
          .stderr.on('data', d => process.stderr.write(d));
  });
}).connect({
  host: '165.245.247.183',
  port: 22,
  username: 'root',
  password: 'ujsf.SRQGUhrpn3$1v'
});
