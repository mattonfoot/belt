
var cardHeight = 65;
var cardWidth = 100;

function MovementTracker( queue, commands, queries ) {
    this._queue = queue;
    this._commands = commands;
    this._queries = queries;

    this._regionalcards = {};
}

MovementTracker.prototype.trackCardMovement = function( location ) {
    var _this = this
      , patch = {
            in: []
          , out: []
        }
      , card;

    this._queries
        .getPocket( location.getPocket() )
        .then(function( resource ) {
            card = resource;

            return _this._queries.getBoard( location.getBoard() );
        })
        .then(function( board ) {
            return _this._queries.getRegionsForBoard( board );
        })
        .then(function( regions ) {
            var update = [];

            regions.forEach(function( region ) {
                var regionid = region.getId()
                  , isInRegion = cardIsInRegion.call( _this, location, region )
                  , areLinked = ~card.getRegions().indexOf( regionid );

                if ( isInRegion ) {
                    if (!areLinked) {
                        patch.in.push( region ); // mark region going in
                    }

                    update.push( regionid );

                    return;
                }

                if ( areLinked ) {
                    patch.out.push( region ); // mark region comming out
                }
            });

            if ( !patch.in.length && !patch.out.length ) return card;

            card.regions = update;

            return _this._commands
                .updatePocket( card )
                .then(function( card ) {
                    patch.out.forEach(function( region ) {
                        _this._queue.emit( 'pocket:regionexit', { pocket: card, region: region } );
                    });

                    patch.in.forEach(function( region ) {
                        _this._queue.emit( 'pocket:regionenter', { pocket: card, region: region } );
                    });

                    return card;
                });
        });
};

MovementTracker.prototype.trackRegionMovement = function( region ) {
    var _this = this;

    this._queries
        .getBoard( region.getBoard() )
        .then(function( board ) {
            return _this._queries.getCardLocationsForBoard( board );
        })
        .then(function( cards ) {
            cards.forEach(function( card ) {
                if ( !cardIsInRegion.call( _this, card, region ) ) {
                    markPocketAsNotInRegion.call( _this, card.getPocket(), region );
                }
            });

            return regions;
        })
        .then(function( cards ) {
            cards.forEach(function( card ) {
                if ( cardIsInRegion.call( _this, card, region ) ) {
                    markPocketAsInRegion.call( _this, card.getPocket(), region );
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
            var numregions = pocket.getRegions().length;

            pocket.addRegion( region );

            if (pocket.getRegions().length > numregions) {
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
            var numregions = pocket.getRegions().length;

            pocket.removeRegion( region );

            if (pocket.getRegions().length < numregions) {
                return _this._commands
                    .updatePocket( pocket )
                    .then(function() {
                        app.queue.emit( 'pocket:regionexit', { pocket: pocket, region: region } );
                    });
            }
        });
}

module.exports = MovementTracker;
