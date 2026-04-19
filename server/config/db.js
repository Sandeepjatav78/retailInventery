const mongoose = require('mongoose');

let cachedConnection = null;

const connectDB = async () => {
	if (mongoose.connection.readyState === 1) {
		return mongoose.connection;
	}

	if (!cachedConnection) {
		cachedConnection = mongoose.connect(process.env.MONGODB_URI, {
			serverSelectionTimeoutMS: 30000,
			connectTimeoutMS: 30000,
			socketTimeoutMS: 45000,
			maxPoolSize: 10,
		});
	}

	try {
		await cachedConnection;
		return mongoose.connection;
	} catch (err) {
		cachedConnection = null;
		throw err;
	}
};

module.exports = connectDB;
