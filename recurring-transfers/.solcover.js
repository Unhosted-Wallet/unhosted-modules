module.exports = {
  configureYulOptimizer: true,
  skipFiles: [
  'handlers',
  'mocks'
],
providerOptions: {
  allowUnlimitedContractSize: true,
},
};