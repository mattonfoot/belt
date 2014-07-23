module.exports = function( config ) {
    return {

        test: {
            files: {
                'browser/tests.js': [ 'tests/**/test.*.js' ]
            }
        },

        src: {
            options: {
                require : { jquery : 'jquery-browserify' }
            },
            files: {
                'build/lib/app.js': [ 'tests/lib/main.js' ]
            }
        }
    };
};
