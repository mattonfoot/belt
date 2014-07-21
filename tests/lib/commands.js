var RSVP = require('rsvp')
  , Promise = RSVP.Promise;

// Commands

function Commands( adapter ) {
    this._db = adapter;
}

Commands.prototype.addWall = function( data ) {
    return this._db.create( 'wall', data );
};

Commands.prototype.modifyWall = function( data ) {
    return this._db.update( 'wall', data );
};

Commands.prototype.addBoard = function( data ) {
    return this._db.create( 'board', data );
};

Commands.prototype.modifyBoard = function( data ) {
    return this._db.update( 'board', data );
};

Commands.prototype.addRegion = function( data ) {
    return this._db.create( 'region', data );
};

Commands.prototype.modifyRegion = function( data ) {
    return this._db.update( 'region', data );
};

Commands.prototype.addPocket = function( data ) {
    return this._db.create( 'pocket', data );
};

Commands.prototype.modifyPocket = function( data ) {
    return this._db.update( 'pocket', data );
};

Commands.prototype.addPocketsToBoard = function( board, pockets ) {
    var promises = pockets.map(function( pocket ) {
        return Commands.addCard( board.getId(), pocket.getId() );
    });

    return RSVP.all( promises );
};

/*
Commands.prototype.addPocketToBoards = function( pocket ) {
    return new Promise(function( resolve, reject ) {
        Queries.getAllBoardsForWall( pocket.getWall() )
            .then(function( boards ) {
                var promises = boards.map(function( board ) {
                    return Commands.addCard( board.getId(), pocket.getId() );
                });

                return RSVP.all( promises )
                    .then( resolve )
                    .catch( reject );
            });
    });
};

Commands.prototype.addCard = function( data ) {

};

Commands.prototype.moveCard = function( data ) {

};

Commands.prototype.addRegion = function( data ) {

};

Commands.prototype.modifyRegion = function( data ) {

};

Commands.prototype.moveRegion = function( data ) {

};

Commands.prototype.resizeRegion = function( data ) {

};
*/
module.exports = Commands;
