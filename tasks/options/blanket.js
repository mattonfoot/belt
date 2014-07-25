module.exports = function( config ) {

    return {

        coverage: {
            src: ['lib/'],
            dest: 'coverage/lib/'
        }

      , features: {
            src: ['tests/lib/'],
            dest: 'coverage/tests/lib/'
        }

    };

};
