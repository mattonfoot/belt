var RSVP = require('rsvp')
  , Promise = RSVP.Promise;

// Application

function Application( events, commands, queries, interface ) {
    this._events = events;
    this._commands = commands;
    this._queries = queries;
    this._interface = interface;
}

Application.prototype.addWall = function( ev ) {
    var _this = this;

    return this._events
        .extractAddWallData( ev )
        .then(function( data ) {
            return _this._commands.addWall( data );
        });
};

Application.prototype.displayWallEditor = function( ev ) {
    var _this = this;

    return this._events
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getWall( id );
        })
        .then(function( wall ) {
            return _this._interface.displayWallEditor( wall );
        });
};

Application.prototype.modifyWall = function( ev ) {
    var _this = this;

    return this._events
        .extractAddWallData( ev )
        .then(function( data ) {
            return _this._commands.modifyWall( data );
        });
};

Application.prototype.openWallSelector = function( ev ) {
    var _this = this;

    return this._events
        .preventDefault( ev )
        .then(function( ev ) {
            return _this._queries.getAllWalls( ev );
        })
        .then(function( walls ) {
            return _this._interface.openWallSelector( walls );
        });
};

/*
Application.prototype.displayWall = function( ev ) {
    return this._events
        .extractTargetId( ev )
        .then( this._queries.getWall )
        .then( Interface.buildWall )
        .then( Interface.displayWall );
};

Application.prototype.displayBoardsForWall = function( ev ) {
    return this._events
        .extractTargetId( ev )
        .then( this._queries.getAllBoardsForWall )
        .then( Interface.buildBoards )
        .then( Interface.displayFirstBoard );
};

Application.prototype.addBoard = function( ev ) {
    return this._events
        .extractAddBoardData( ev )
        .then( Commands.addBoard )
        .then( Commands.addPocketsToBoard );
};

Application.prototype.modifyBoard = function( ev ) {
    return this._events
        .extractModifyBoardData( ev )
        .then( Commands.modifyBoard );
};

Application.prototype.addPocket = function( ev ) {
    return this._events
        .extractAddPocketData( ev )
        .then( Commands.addPocket )
        .then( Commands.addPocketToBoards );
};

Application.prototype.modifyPocket = function( ev ) {
    return this._events
        .extractModifyPocketData( ev )
        .then( Commands.modifyPocket );
};

Application.prototype.addRegion = function( ev ) {
    this._events.extractAddRegionData( ev )
        .then( Commands.addRegion );
};

Application.prototype.modifyRegion = function( ev ) {
    return this._events
        .extractModifyRegionData( ev )
        .then( Commands.modifyRegion );
};
*/
var app = new Application();

module.exports = Application;
