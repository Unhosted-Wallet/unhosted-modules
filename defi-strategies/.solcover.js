module.exports = {
  mocha: {
    grep: "@skip-on-coverage",
    invert: true
  },
  configureYulOptimizer: true,
  skipFiles: [
  'handlers',
  'mocks'
],
providerOptions: {
  allowUnlimitedContractSize: true,
},
};