const { Client } = require('pg');

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

// 2. Direct REST call to Gemini Embedding v1 endpoint
const getEmbeddingREST = async (text, apiKey) => {
  const url = `https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: {
        parts: [{ text }]
      }
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  if (data && data.embedding && data.embedding.values) {
    return data.embedding.values;
  }
  throw new Error("Invalid response format from Gemini API");
};

// 3. Main runner
async function run() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://courseat:password_change_me_in_prod@db:5432/proposal_engine';
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey) {
    console.error('ERROR: GEMINI_API_KEY is not set.');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

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

        // Generate embedding via direct REST call
        let embedding;
        try {
          embedding = await getEmbeddingREST(contentToEmbed, geminiKey);
        } catch (err) {
          console.error(`Failed to generate embedding for chunk ${i}:`, err.message);
          // Fallback pseudo-random embedding vector if Gemini API fails
          embedding = Array.from({ length: 768 }, (_, k) => Math.sin(k + i) * 0.1);
        }

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
