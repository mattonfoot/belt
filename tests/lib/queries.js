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

Queries.prototype.getBoardsForWall = function( wall ) {
    var _this = this
      , boardids = wall.getBoards();

    return new Promise(function( resolve, reject ) {
        if (!boardids.length) {
            resolve([]);
        }

        _this._db.findMany( 'board', boardids )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getCardLocation = function( id ) {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.find( 'cardlocation', id )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getCardLocationsForBoard = function( board ) {
    var _this = this
      , ids = board.getCardLocations();

    return new Promise(function( resolve, reject ) {
        if (!ids.length) {
            resolve([]);
        }

        _this._db.findMany( 'cardlocation', ids )
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

Queries.prototype.getPocketsForWall = function( wall ) {
    var _this = this
      , pocketids = wall.getPockets();

    return new Promise(function( resolve, reject ) {
        if (!pocketids.length) {
            resolve([]);
        }

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

Queries.prototype.getRegionsForBoard = function( board ) {
    var _this = this
      , regionids = board.getRegions();

    return new Promise(function( resolve, reject ) {
        if (!regionids.length) {
            resolve([]);
        }

        _this._db.findMany( 'region', regionids )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getTransformsForBoard = function( board ) {
    var _this = this
      , transformids = board.getTransforms();

    return new Promise(function( resolve, reject ) {
        if (!transformids.length) {
            resolve([]);
        }

        _this._db.findMany( 'transform', transformids )
            .then( resolve )
            .catch( reject );
    });
};

Queries.prototype.getAllTransforms = function() {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.findMany( 'transforms' )
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

Queries.prototype.getAllWalls = function() {
    var _this = this;

    return new Promise(function( resolve, reject ) {
        _this._db.findMany( 'wall' )
            .then( resolve )
            .catch( reject );
    });
};

module.exports = Queries;
