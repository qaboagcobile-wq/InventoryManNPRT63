const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory mutex queues for atomic writes per file
const writeLocks = new Map();

async function acquireLock(filename) {
  while (writeLocks.get(filename)) {
    await writeLocks.get(filename);
  }
  let resolver;
  const promise = new Promise((resolve) => {
    resolver = resolve;
  });
  writeLocks.set(filename, promise);
  return () => {
    writeLocks.delete(filename);
    resolver();
  };
}

const dataStore = {
  getFilePath(entity) {
    return path.join(DATA_DIR, `${entity}.json`);
  },

  async read(entity) {
    const filePath = this.getFilePath(entity);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const data = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(data || '[]');
    } catch (err) {
      console.error(`Error reading ${entity}:`, err);
      return [];
    }
  },

  readSync(entity) {
    const filePath = this.getFilePath(entity);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data || '[]');
    } catch (err) {
      console.error(`Error synchronously reading ${entity}:`, err);
      return [];
    }
  },

  async write(entity, data) {
    const filePath = this.getFilePath(entity);
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    const releaseLock = await acquireLock(entity);

    try {
      // Atomic write: write to temp file then atomic rename
      await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.promises.rename(tempPath, filePath);
    } catch (err) {
      console.error(`Error writing ${entity}:`, err);
      if (fs.existsSync(tempPath)) {
        try {
          await fs.promises.unlink(tempPath);
        } catch (_) {}
      }
      throw err;
    } finally {
      releaseLock();
    }
  },

  writeSync(entity, data) {
    const filePath = this.getFilePath(entity);
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, filePath);
    } catch (err) {
      console.error(`Error synchronously writing ${entity}:`, err);
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (_) {}
      }
      throw err;
    }
  },

  // Helper find/filter methods
  async find(entity, predicate) {
    const records = await this.read(entity);
    return records.find(predicate);
  },

  async filter(entity, predicate) {
    const records = await this.read(entity);
    return records.filter(predicate);
  },

  async insert(entity, record) {
    const records = await this.read(entity);
    records.push(record);
    await this.write(entity, records);
    return record;
  },

  async update(entity, predicate, updates) {
    const records = await this.read(entity);
    const index = records.findIndex(predicate);
    if (index === -1) return null;
    records[index] = { ...records[index], ...updates };
    await this.write(entity, records);
    return records[index];
  },

  async delete(entity, predicate) {
    const records = await this.read(entity);
    const index = records.findIndex(predicate);
    if (index === -1) return false;
    const removed = records.splice(index, 1);
    await this.write(entity, records);
    return removed[0];
  }
};

module.exports = dataStore;
