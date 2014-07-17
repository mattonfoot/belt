var mocha = require('mocha');

module.exports = function( config ) {

    var tests = ['tests/**/*.js'];
    var coverage = ['coverage/tests/**/*.js'];

    return {

        test: {
            options: {
                reporter: 'spec'
            }

          , src: tests
        }

      , instrumented: {
            options: {
                reporter: 'spec'
            }

          , src: coverage
        }

      , coverage: {
            options: {
                reporter: 'html-cov'
              , quiet: true
              , captureFile: 'reports/coverage.html'
            }

          , src: coverage
        }

      , lcov: {
            options: {
              reporter: 'mocha-lcov-reporter',
              quiet: true,
              captureFile: 'reports/lcov.info'
            },
            src: coverage
        }

      , 'travis-cov': {
            options: {
                reporter: 'travis-cov'
            }

          , src: coverage
        }

    };

};
