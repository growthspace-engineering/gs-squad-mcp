const fs = require('fs');
const path = require('path');
const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

const ensureDirectoryExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const testResultsDir = path.join(
  __dirname,
  'test-results',
  'gs-squad-mcp',
  'unit'
);

const coverageDir = path.join(testResultsDir, 'coverage');

ensureDirectoryExists(testResultsDir);
ensureDirectoryExists(coverageDir);

module.exports = {
  displayName: 'unit',
  moduleFileExtensions: [ 'js', 'json', 'ts' ],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest'
  },
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths || {}, {
    prefix: '<rootDir>/../'
  }),
  setupFilesAfterEnv: [ '<rootDir>/../jest.setup.ts' ],
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.module.ts',
    '!**/index.ts',
    '!**/*.d.ts',
    '!**/*.spec.ts',
    '!**/*.test.ts'
  ],
  coverageDirectory: coverageDir,
  coverageReporters: [ 'json', 'text', 'lcov', 'clover', 'json-summary', 'html' ],
  modulePathIgnorePatterns: [ '<rootDir>/dist/' ],
  // Performance optimizations
  maxWorkers: '75%',
  // Verbose output for better readability
  verbose: true,
  testEnvironment: 'node',
  // Reporters
  reporters: [
    'default',
    [
      'jest-stare',
      {
        resultDir: testResultsDir,
        reportTitle: 'gs-squad-mcp Unit Test Results',
        reportHeadline: 'gs-squad-mcp Unit Test Results',
        additionalResultsProcessors: [],
        coverageLink: './coverage/index.html'
      }
    ],
    [
      'jest-junit',
      {
        outputDirectory: testResultsDir,
        outputName: 'junit.xml',
        suiteName: 'gs-squad-mcp Unit Tests',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: 'false'
      }
    ]
  ]
};
