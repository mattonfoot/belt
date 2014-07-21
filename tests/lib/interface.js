var RSVP = require('rsvp')
  , Promise = RSVP.Promise;

// Commands

function Interface() {
    this.calllist = [];
}

Interface.prototype.displayWallEditor = function( wall ) {
    this.calllist.push({
        call: 'displayWallEditor'
      , data: wall
    });
};

Interface.prototype.openWallSelector = function( walls ) {
    this.calllist.push({
        call: 'openWallSelector'
      , data: walls
    });
};

Interface.prototype.buildWall = function( wall ) {
    this.calllist.push({
        call: 'buildWall'
      , data: wall
    });
};

Interface.prototype.displayWall = function( wall ) {
    this.calllist.push({
        call: 'displayWall'
      , data: wall
    });
};

Interface.prototype.displayBoardEditor = function( board ) {
    this.calllist.push({
        call: 'displayBoardEditor'
      , data: board
    });
};

Interface.prototype.displayRegionEditor = function( region ) {
    this.calllist.push({
        call: 'displayRegionEditor'
      , data: region
    });
};

module.exports = Interface;
