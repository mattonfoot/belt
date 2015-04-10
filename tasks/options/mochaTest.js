var mocha = require('mocha');

module.exports = function( config ) {

    var tests = ['test/**/*.js', '!**/*.skip.js'];
    var coverage = ['coverage/test/**/*.js'];

    var configSlow;
    var configTimeout;

    return {

        test: {
            options: {
                reporter: 'spec'
              , slow: configSlow
              , timeout: configTimeout
            }

          , src: tests
        }

      , instrumented: {
            options: {
                reporter: 'spec'
              , slow: configSlow
              , timeout: configTimeout
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
