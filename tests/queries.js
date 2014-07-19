var RSVP = require('rsvp')
  , Promise = RSVP.Promise;

// Commands

function Queries( adapter ) {
    this._db = adapter;
}

Queries.prototype.getAllWalls = function() {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.findMany( 'wall' )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getWall = function( id ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.find( 'wall', id )
            .then( resolve )
            .catch( reject );
    });
};
/*
Queries.prototype.getAllBoardsForWall = function( id ) {

};

Queries.prototype.getAllBoardsForPocket = function( pocket ) {
    return {
        pocket: pocket,
        boards: []
    };
};

Queries.prototype.getAllPocketsForWall = function( id ) {

};

Queries.prototype.getAllPocketsForBoard = function( board ) {
    return {
        board: board,
        pockets: []
    };
};
*/
module.exports = Queries;
