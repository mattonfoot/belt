
var cardHeight = 65;
var cardWidth = 100;

function MovementTracker( queue, commands, queries ) {
    this._queue = queue;
    this._commands = commands;
    this._queries = queries;

    this._regionalcards = {};
}

MovementTracker.prototype.trackCardMovement = function( card ) {
    var _this = this;

    this._queries
        .getBoard( card.getBoard() )
        .then(function( board ) {
            return _this.queries.getRegionsForBoard( board );
        })
        .then(function( regions ) {
            regions.forEach(function( region ) {
                if ( !cardIsInRegion.call( _this, card, region ) ) {
                    markPocketAsNotInRegion.call( _this, card.links.pocket, region );
                }
            });

            return regions;
        })
        .then(function( regions ) {
            regions.forEach(function( region ) {
                if ( cardIsInRegion.call( _this, card, region ) ) {
                    markPocketAsInRegion.call( this, card.links.pocket, region );
                }
            });
        });
};

MovementTracker.prototype.trackRegionMovement = function( region ) {
    var _this = this;

    this._queries
        .getBoard( card.getBoard() )
        .then(function( board ) {
            return _this.queries.getCardsForBoard( board );
        })
        .then(function( cards ) {
            cards.forEach(function( card ) {
                if ( !cardIsInRegion.call( _this, card, region ) ) {
                    markPocketAsNotInRegion.call( _this, card.links.pocket, region );
                }
            });

            return regions;
        })
        .then(function( cards ) {
            cards.forEach(function( card ) {
                if ( cardIsInRegion.call( _this, card, region ) ) {
                    markPocketAsInRegion.call( _this, card.links.pocket, region );
                }
            });
        });
};

function cardIsInRegion( card, region ) {
    var cardX = (card.x + (cardHeight / 2))
      , cardY = (card.y + (cardWidth / 2))
      , inLeft = cardX > region.x
      , inRight = cardX < (region.x + region.width)
      , inTop = cardY > region.y
      , inBase = cardY < (region.y + region.height);

    return ( inLeft && inRight && inTop && inBase );
}

function markPocketAsInRegion( pocketid, region ) {
    var _this = this;

    return this._queries
        .getPocket( pocketid )
        .then(function( pocket ) {
            var regions = pocket.getRegions();

            pocket.addRegion( region.getId() );

            if (pocket.getRegions().length > regions.length) {
                return _this._commands
                    .updatePocket( pocket )
                    .then(function() {
                        _this._queue.emit( 'pocket:regionenter', { pocket: pocket, region: region } );
                    });

            }
        });
}

function markPocketAsNotInRegion( pocketid, region ) {
    var _this = this;

    return this._queries
        .getPocket( pocketid )
        .then(function( pocket ) {
            var regions = pocket.getRegions();

            pocket.removeRegion( region.getId() );

            if (pocket.getRegions().length < regions.length) {
                return _this._commands
                    .updatePocket( pocket )
                    .then(function() {
                        app.queue.emit( 'pocket:regionexit', { pocket: pocket, region: region } );
                    });
            }
        });
}

module.exports = MovementTracker;
