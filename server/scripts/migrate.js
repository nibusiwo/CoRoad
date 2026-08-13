require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const migrationsDir = path.resolve(__dirname, '..', 'src', 'config', 'migrations');
const dryRun = process.argv.includes('--dry-run');

function getConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'coroad',
    multipleStatements: false,
  };
}

function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function isAlreadyAppliedError(error) {
  return ['ER_TABLE_EXISTS_ERROR', 'ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME'].includes(error.code);
}

async function main() {
  const connection = await mysql.createConnection(getConfig());
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) NOT NULL PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const [appliedRows] = await connection.query('SELECT version, checksum FROM schema_migrations');
    const applied = new Map(appliedRows.map((row) => [row.version, row.checksum]));
    const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
    const checksums = new Map(files.map((file) => [
      file,
      require('crypto').createHash('sha256').update(fs.readFileSync(path.join(migrationsDir, file), 'utf8')).digest('hex'),
    ]));

    for (const [version, checksum] of applied) {
      if (checksums.has(version) && checksum !== checksums.get(version)) {
        throw new Error(`Migration checksum mismatch for ${version}; restore the original file or create a new migration`);
      }
    }

    const pending = files.filter((file) => !applied.has(file));

    if (dryRun) {
      console.log(JSON.stringify({ database: getConfig().database, applied: [...applied.keys()], pending }, null, 2));
      return;
    }

    for (const file of pending) {
      const source = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const checksum = checksums.get(file);
      const statements = splitStatements(source);
      console.log(`[Migration] ${file} (${statements.length} statements)`);
      await connection.beginTransaction();
      try {
        for (const statement of statements) {
        try {
          await connection.query(statement);
        } catch (error) {
          // A previous run may have completed DDL before failing on a later
          // data statement. DDL is idempotent for the migration runner; data
          // statements still fail loudly.
          if (isAlreadyAppliedError(error)) {
            console.warn(`[Migration] already applied statement skipped: ${error.code}`);
            continue;
          }
          throw error;
        }
        }
        await connection.query(
          'INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)',
          [file, checksum],
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw new Error(`${file}: ${error.message}`);
      }
    }

    console.log(`[Migration] complete; applied ${pending.length} migration(s)`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('[Migration] failed:', error.message);
  process.exitCode = 1;
});
