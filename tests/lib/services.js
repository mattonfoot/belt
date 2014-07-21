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
        .extractModifyWallData( ev )
        .then(function( data ) {
            return _this._commands.modifyWall( data );
        });
};

Application.prototype.openWallSelector = function( ev ) {
    var _this = this;

    return this._events
        .preventDefault( ev )
        .then(function( ev ) {
            return _this._queries.getAllWalls();
        })
        .then(function( walls ) {
            return _this._interface.openWallSelector( walls );
        });
};


Application.prototype.displayWall = function( ev ) {
    var _this = this;

    return this._events
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getWall( id );
        })
        .then(function( wall ) {
            _this._interface.buildWall( wall );
            return wall;
        })
        .then(function( wall ) {
            return _this._interface.displayWall( wall );
        })
        .then(function( wall ) {
            return ( wall );
        });
};

Application.prototype.addBoard = function( ev ) {
    var _this = this, board;

    return this._events
        .extractAddBoardData( ev )
        .then(function( data ) {
            return _this._commands.addBoard( data );
        })
        .then(function( resource ) {
            board = resource;

            return _this._queries.getAllPocketsForWall( board.getWall() );
        })
        .then(function( pockets ) {
            return _this._commands.addPocketsToBoard( board, pockets );
        })
        .then(function( cards ) {
            return board;
        });
};

Application.prototype.displayBoardEditor = function( ev ) {
    var _this = this;

    return this._events
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getBoard( id );
        })
        .then(function( board ) {
            return _this._interface.displayBoardEditor( board );
        });
};

Application.prototype.modifyBoard = function( ev ) {
    var _this = this;

    return this._events
        .extractModifyBoardData( ev )
        .then(function( data ) {
            return _this._commands.modifyBoard( data );
        });
};

/*
Application.prototype.displayBoardsForWall = function( ev ) {
    return this._events
        .extractTargetId( ev )
        .then( this._queries.getAllBoardsForWall )
        .then( Interface.buildBoards )
        .then( Interface.displayFirstBoard );
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
