module.exports = function( config ) {

  return {
    coverage: {
      expand: true,
      cwd: './',
      src: [ 'test/**/*.*' ],
      dest: './coverage/'
    }
  };

};
