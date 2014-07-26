// Commands

function Interface( queue, ui ) {
    this._queue = queue;
    this._ui = ui;
}

Interface.prototype.addBoard = function( board ) {
    this.displayBoard( board );

    if (this._ui) this._ui.displayBoardSelector( this._wall, board );

    this._queue.trigger( 'board:added', board );
};

Interface.prototype.displayBoard = function( board ) {
    if ( !this._wall || board.getWall() !== this._wall.getId() ) return;

    this._board = board;
    this._regions = [];
    this._cardlocations = [];

    if (this._ui) this._ui.displayBoard( board );

    this._queue.trigger( 'board:displayed', board );

    this.enableControls();
};

Interface.prototype.displayBoardCreator = function() {
    if ( !this._wall ) return;

    if (this._ui) this._ui.displayBoardCreator( this._wall );

    this._queue.trigger( 'boardcreator:displayed' );
};

Interface.prototype.displayBoardEditor = function( board ) {
    if (this._ui) this._ui.displayBoardEditor( board );

    this._queue.trigger( 'boardeditor:displayed', board );
};

Interface.prototype.displayBoardSelector = function( boards ) {
    if (this._ui) this._ui.displayBoardSelector( this._wall, boards );

    this._queue.trigger( 'boardselector:displayed', boards );
};

// cardlocations

Interface.prototype.displayCardLocation = function( location, pocket ) {
    if ( !this._board || location.getBoard() !== this._board.getId() || ~this._cardlocations.indexOf( location.getId() )) return;

    this._cardlocations.push( location.getId() );

    if (this._ui) this._ui.displayCardLocation( location, pocket );

    this._queue.trigger( 'cardlocation:displayed', location );
};

Interface.prototype.displayPocketCreator = function() {
    if ( !this._wall ) return;

    if (this._ui) this._ui.displayPocketCreator( this._wall );

    this._queue.trigger( 'pocketcreator:displayed' );
};

Interface.prototype.displayPocketEditor = function( pocket ) {
    if (this._ui) this._ui.displayPocketEditor( pocket );

    this._queue.trigger( 'pocketeditor:displayed', pocket );
};

// regions

Interface.prototype.displayRegion = function( region ) {
    if ( !this._board || region.getBoard() !== this._board.getId() || ~this._regions.indexOf( region.getId() )) return;

    this._regions.push( region.getId() );

    if (this._ui) this._ui.displayRegion( region );

    this._queue.trigger( 'region:displayed', region );
};

Interface.prototype.displayRegions = function( regions ) {
    var _this = this;

    regions.forEach(function( region ) {
        _this.displayRegion( region );
    });
};

Interface.prototype.displayRegionCreator = function() {
    if ( !this._board ) return;

    if (this._ui) this._ui.displayRegionCreator( this._board );

    this._queue.trigger( 'regioncreator:displayed' );
};

Interface.prototype.displayRegionEditor = function( region ) {
    if (this._ui) this._ui.displayRegionEditor( region );

    this._queue.trigger( 'regioneditor:displayed', region );
};

// walls

Interface.prototype.displayWall = function( wall ) {
    this._wall = wall;
    this._regions = [];
    this._cardlocations = [];
    delete this._board;

    if (this._ui) this._ui.displayWall( wall );

    this._queue.trigger( 'wall:displayed', wall );
};

Interface.prototype.displayWallCreator = function() {
    if (this._ui) this._ui.displayWallCreator();

    this._queue.trigger( 'wallcreator:displayed' );
};

Interface.prototype.displayWallEditor = function( wall ) {
    if (this._ui) this._ui.displayWallEditor( wall );

    this._queue.trigger( 'walleditor:displayed', wall );
};

Interface.prototype.displayWallSelector = function( walls ) {
    if (this._ui) this._ui.displayWallSelector( walls );

    this._queue.trigger( 'wallselector:displayed', walls );
};

Interface.prototype.notifyWallFirstTime = function( wall ) {
    this._queue.trigger( 'wall:firsttime', wall );

    this.displayBoardCreator();
};

Interface.prototype.enableControls = function( data ) {
    if (this._ui) this._ui.enableControls( data );

    this._queue.trigger( 'controls:enabled' );
};

module.exports = Interface;
