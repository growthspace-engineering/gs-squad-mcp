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
  'e2e'
);

const coverageDir = path.join(testResultsDir, 'coverage');

ensureDirectoryExists(testResultsDir);
ensureDirectoryExists(coverageDir);

module.exports = {
  displayName: 'e2e',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs'
        }
      }
    ]
  },
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths || {}, {
    prefix: '<rootDir>/'
  }),
  setupFilesAfterEnv: [ '<rootDir>/jest.setup.ts' ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/**/*.module.ts'
  ],
  coverageDirectory: coverageDir,
  coverageReporters: [ 'json', 'text', 'lcov', 'clover', 'json-summary', 'html' ],
  modulePathIgnorePatterns: [ '<rootDir>/dist/' ],
  maxWorkers: '75%',
  // Verbose output for better readability
  verbose: true,
  // Mitigate occasional Node event-loop linger after reporters finish
  detectOpenHandles: true,
  forceExit: true,
  testEnvironment: 'node',
  // Reporters
  // Note: jest-junit removed from e2e config due to temp directory access issues
  // that prevent coverage from being generated. Unit tests still generate junit.xml.
  reporters: [
    'default',
    [
      'jest-stare',
      {
        resultDir: testResultsDir,
        reportTitle: 'gs-squad-mcp E2E Test Results',
        reportHeadline: 'gs-squad-mcp E2E Test Results',
        additionalResultsProcessors: [],
        coverageLink: './coverage/index.html'
      }
    ]
  ]
};
