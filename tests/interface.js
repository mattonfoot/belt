var RSVP = require('rsvp')
  , Promise = RSVP.Promise;

// Commands

function Interface() {
}

Interface.prototype.displayWallEditor = function( wall ) {
    return {
        displayWallEditor: true
      , data: wall
    };
};

Interface.prototype.openWallSelector = function( walls ) {
    return {
        openWallSelector: true
      , data: walls
    };
};

module.exports = Interface;
