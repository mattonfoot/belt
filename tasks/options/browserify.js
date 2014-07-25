var literalify = require('literalify');

module.exports = function( config ) {
    return {

        test: {
            files: {
                'browser/tests.js': [ 'tests/**/test.*.js' ]
            }
        },

        src: {
            options: {
                transform: [
                    literalify.configure({
                        'jquery': 'window.$'
                    })
                ]
            }

          , files: {
                'build/lib/app.js': [ 'tests/lib/main.js' ]
            }
        }
    };
};
