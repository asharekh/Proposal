const { Client } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 1. Sliding window paragraph text chunker helper
const splitTextIntoChunks = (text, chunkSize = 1200, overlapSize = 150) => {
  if (!text) return [];
  const normalized = text.trim();
  if (normalized.length <= chunkSize) {
    return [normalized];
  }

  const chunks = [];
  let startIndex = 0;

  while (startIndex < normalized.length) {
    let endIndex = startIndex + chunkSize;
    
    if (endIndex < normalized.length) {
      // Find a boundary in the last 20% of the chunk range
      const searchStart = Math.max(startIndex, endIndex - Math.floor(chunkSize * 0.2));
      const boundarySub = normalized.substring(searchStart, endIndex);
      let boundaryIdx = -1;
      
      boundaryIdx = boundarySub.lastIndexOf("\n");
      if (boundaryIdx === -1) {
        boundaryIdx = Math.max(
          boundarySub.lastIndexOf("."),
          boundarySub.lastIndexOf("!")
        );
      }
      if (boundaryIdx === -1) {
        boundaryIdx = boundarySub.lastIndexOf(" ");
      }
      
      if (boundaryIdx !== -1) {
        endIndex = searchStart + boundaryIdx + 1;
      }
    } else {
      endIndex = normalized.length;
    }

    const chunk = normalized.substring(startIndex, endIndex).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    // Set start of next chunk with sliding overlap
    startIndex = Math.max(startIndex + 1, endIndex - overlapSize);
  }

  return chunks;
};

// 2. Main runner
async function run() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/proposal_engine';
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey) {
    console.error('ERROR: GEMINI_API_KEY is not set.');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  const genAI = new GoogleGenerativeAI(geminiKey);
  const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

  try {
    console.log('Querying proposals for backfilling chunks...');
    
    // Find all proposals that do not yet have any entries in proposal_chunks
    const query = `
      SELECT p.id, p.tenant_id, p.rfp_title, p.training_type, p.sector, p.content_text 
      FROM proposals p
      LEFT JOIN proposal_chunks c ON p.id = c.proposal_id
      WHERE c.id IS NULL
    `;
    const res = await client.query(query);
    console.log(`Found ${res.rows.length} proposals to migrate.`);

    for (const row of res.rows) {
      console.log(`Processing proposal ID ${row.id}: "${row.rfp_title}"`);
      const chunks = splitTextIntoChunks(row.content_text, 1200, 150);
      console.log(`- Segmented into ${chunks.length} chunks.`);

      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        
        // Prepare metadata prefix for embedding context
        const parts = [
          row.rfp_title ? `Title: ${row.rfp_title}` : "",
          row.training_type ? `Type: ${row.training_type}` : "",
          row.sector ? `Sector: ${row.sector}` : "",
          chunkText,
        ].filter(Boolean);
        const contentToEmbed = parts.join("\n").substring(0, 8000);

        // Generate embedding
        const embedRes = await embedModel.embedContent(contentToEmbed);
        const embedding = embedRes.embedding.values;

        // Insert chunk
        const vectorStr = `[${embedding.join(",")}]`;
        await client.query(
          `INSERT INTO proposal_chunks (proposal_id, tenant_id, chunk_index, content_text, embedding) 
           VALUES ($1, $2, $3, $4, $5::vector)`,
          [row.id, row.tenant_id, i, chunkText, vectorStr]
        );
      }
      console.log(`- Successfully migrated proposal ID ${row.id}`);
    }

    console.log('All migrations completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

run();
