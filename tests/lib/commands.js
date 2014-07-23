var RSVP = require('rsvp')
  , Promise = RSVP.Promise;

// Commands

function Commands( adapter ) {
    this._db = adapter;
}

Commands.prototype.createBoard = function( data ) {
    return this._db.create( 'board', data ); // --> board:created
};

Commands.prototype.updateBoard = function( data ) {
    return this._db.update( 'board', data ); // --> board:updated
};

Commands.prototype.createCard = function( data ) {
    return this._db.create( 'card', data ); // --> card:created
};

Commands.prototype.updateCard = function( data ) {
    return this._db.update( 'card', data ); // --> card:updated
};

Commands.prototype.createPocket = function( data ) {
    return this._db.create( 'pocket', data ); // --> pocket:created
};

Commands.prototype.updatePocket = function( data ) {
    return this._db.update( 'pocket', data ); // --> pocket:updated
};

Commands.prototype.createRegion = function( data ) {
    return this._db.create( 'region', data ); // --> region:created
};

Commands.prototype.updateRegion = function( data ) {
    return this._db.update( 'region', data ); // --> region:updated
};

Commands.prototype.createWall = function( data ) {
    return this._db.create( 'wall', data ); // --> wall:created
};

Commands.prototype.updateWall = function( data ) {
    return this._db.update( 'wall', data ); // --> wall:updated
};

Commands.prototype.addPocketsToBoard = function( board, pockets ) {
    var _this = this;

    var promises = pockets.map(function( pocket ) {
        return _this.createCard( board.getId(), pocket.getId() );
    });

    return RSVP.all( promises );
};

Commands.prototype.addPocketToBoards = function( boards, pocket ) {
    var _this = this;

    var promises = boards.map(function( board ) {
        return _this.createCard( board.getId(), pocket.getId() );
    });

    return RSVP.all( promises );
};

module.exports = Commands;
