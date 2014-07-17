module.exports = function( config ) {

    var src = ['tests/**/*.js'];

    return {
        test: {
            options: {
                reporter: 'spec'
            },
            src: src
        },

        ci: {
            options: {
                reporter: 'XUnit'
            },
            src: src
          , dest: './test/output/xunit.out'
        }
    };

};
