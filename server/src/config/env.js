function getServerConfig(input = process.env) {
  return {
    port: Number(input.PORT || 4000),
    mongoUri: input.MONGODB_URI || input.MONGO_URI || '',
  };
}

module.exports = {
  getServerConfig,
};
