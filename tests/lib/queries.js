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

Queries.prototype.getWall = function( wallid ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.find( 'wall', wallid )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getBoard = function( boardid ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.find( 'board', boardid )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getAllBoardsForWall = function( wallid ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.findMany( 'board', { wall: wallid } )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getRegion = function( regionid ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.find( 'region', regionid )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getAllRegionsOnBoard = function( boardid ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.findMany( 'region', { board: boardid } )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getPocket = function( pocketid ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.find( 'pocket', pocketid )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getAllPocketsForWall = function( wallid ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.findMany( 'pocket', { wall: wallid } )
            .then( resolve )
            .catch( reject );
    });
};

module.exports = Queries;
