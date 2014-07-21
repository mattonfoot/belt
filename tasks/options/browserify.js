module.exports = function( config ) {
    return {
        test: {
            files: {
                'browser/tests.js': [ 'tests/**/test.*.js' ]
            }
        },

        watch: {
            files: {
                'browser/tests.js': [ 'tests/**/test.*.js' ]
            },
            watch: true
        }
    };
};
