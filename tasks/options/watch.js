module.exports = function( config ) {

    return {

        src: {
            files: 'lib/**/*.js',
            tasks: [ 'test' ]
        }

      , test: {
            files: 'tests/**/*.js',
            tasks: [ 'test' ]
        }
    };

};
