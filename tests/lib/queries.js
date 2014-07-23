var RSVP = require('rsvp')
  , Promise = RSVP.Promise;

// Commands

function Queries( adapter ) {
    this._db = adapter;
}

Queries.prototype.getBoard = function( boardid ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.find( 'board', boardid )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getBoards = function( boardids ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.findMany( 'board', boardids )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getCard = function( cardid ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.find( 'card', cardid )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getCards = function( cardids ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.findMany( 'card', cardids )
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

Queries.prototype.getPockets = function( pocketids ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.findMany( 'pocket', pocketids )
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

Queries.prototype.getRegions = function( regionids ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.findMany( 'region', regionids )
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

Queries.prototype.getWalls = function( wallids ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.findMany( 'wall', wallids )
            .then( resolve )
            .catch( reject );
    });
};

module.exports = Queries;
