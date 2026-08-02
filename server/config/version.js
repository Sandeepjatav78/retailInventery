const { execSync } = require('child_process');
const SystemConfig = require('../models/SystemConfig');

let cachedGitSha = null;
let memoryTokenVersion = 1;
let isDbSynced = false;

const getGitCommitSha = () => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  if (process.env.VERCEL_DEPLOYMENT_ID) return process.env.VERCEL_DEPLOYMENT_ID;
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT;
  if (process.env.BUILD_ID) return process.env.BUILD_ID;

  if (cachedGitSha) return cachedGitSha;

  try {
    const sha = execSync('git rev-parse HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (sha) {
      cachedGitSha = sha;
      return cachedGitSha;
    }
  } catch (err) {
    // Git not available or not a git repository
  }

  if (!global.SERVER_START_TIME) {
    global.SERVER_START_TIME = 'build_' + Date.now();
  }
  return global.SERVER_START_TIME;
};

// Sync tokenVersion from MongoDB SystemConfig once on startup
const syncTokenVersionFromDb = async () => {
  if (isDbSynced) return memoryTokenVersion;
  try {
    let config = await SystemConfig.findOne({ key: 'tokenVersion' });
    if (!config) {
      config = await SystemConfig.create({ key: 'tokenVersion', value: 1 });
    }
    memoryTokenVersion = Number(config.value) || 1;
    isDbSynced = true;
  } catch (err) {
    console.warn('[Version] Failed to sync tokenVersion from DB, using fallback:', err.message);
  }
  return memoryTokenVersion;
};

// Increment tokenVersion in DB to force-logout all active sessions
const incrementDbTokenVersion = async () => {
  try {
    let config = await SystemConfig.findOneAndUpdate(
      { key: 'tokenVersion' },
      { $inc: { value: 1 }, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    memoryTokenVersion = Number(config.value) || memoryTokenVersion + 1;
    return memoryTokenVersion;
  } catch (err) {
    memoryTokenVersion += 1;
    return memoryTokenVersion;
  }
};

const getDeployVersion = () => {
  return `${getGitCommitSha()}_v${memoryTokenVersion}`;
};

module.exports = {
  getDeployVersion,
  getGitCommitSha,
  syncTokenVersionFromDb,
  incrementDbTokenVersion,
  getMemoryTokenVersion: () => memoryTokenVersion
};
