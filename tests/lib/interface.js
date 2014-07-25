// Commands

function Interface( queue ) {
    this._queue = queue;
}

Interface.prototype.addBoard = function( board ) {
    this.displayBoard( board );

    // this._ui.addBoard();

    this._queue.trigger( 'board:added', board );
};

Interface.prototype.displayBoard = function( board ) {
    if ( !this._wall || board.getWall() !== this._wall.getId() ) return;

    this._board = board;
    this._regions = [];
    this._cardlocations = [];

    this._queue.trigger( 'board:displayed', board );

    this.enableControls();
};

Interface.prototype.displayBoardCreator = function() {
    this._queue.trigger( 'boardcreator:displayed' );
};

Interface.prototype.displayBoardEditor = function( board ) {
    this._queue.trigger( 'boardeditor:displayed', board );
};

Interface.prototype.displayBoardSelector = function( boards ) {
    this._queue.trigger( 'boardselector:displayed', boards );
};

// cardlocations

Interface.prototype.displayCardLocation = function( cardlocation ) {
    if ( !this._board || card.getBoard() !== this._board.getId() || ~this._cardlocations.indexOf( cardlocation.getId() )) return;

    this._cardlocations.push( cardlocation.getId() );

    this._queue.trigger( 'cardlocation:displayed', cardlocation );
};

Interface.prototype.displayCardLocations = function( cardlocations ) {
    var _this = this;

    cardlocations.forEach(function( cardlocation ) {
        _this.displayCardLocation( cardlocation );
    });
};

Interface.prototype.displayPocketCreator = function() {
    this._queue.trigger( 'pocketcreator:displayed' );
};

Interface.prototype.displayPocketEditor = function( pocket ) {
    this._queue.trigger( 'pocketeditor:displayed', pocket );
};

// regions

Interface.prototype.displayRegion = function( region ) {
    if ( !this._board || region.getBoard() !== this._board.getId() || ~this._regions.indexOf( region.getId() )) return;

    this._regions.push( region.getId() );

    this._queue.trigger( 'region:displayed', region );
};

Interface.prototype.displayRegions = function( regions ) {
    var _this = this;

    regions.forEach(function( region ) {
        _this.displayRegion( region );
    });
};

Interface.prototype.displayRegionCreator = function() {
    this._queue.trigger( 'regioncreator:displayed' );
};

Interface.prototype.displayRegionEditor = function( region ) {
    this._queue.trigger( 'regioneditor:displayed', region );
};

// walls

Interface.prototype.displayWall = function( wall ) {
    this._wall = wall;
    this._regions = [];
    this._cardlocations = [];
    delete this._board;

    this._queue.trigger( 'wall:displayed', wall );
};

Interface.prototype.displayWallCreator = function() {
    this._queue.trigger( 'wallcreator:displayed' );
};

Interface.prototype.displayWallEditor = function( wall ) {
    this._queue.trigger( 'walleditor:displayed', wall );
};

Interface.prototype.displayWallSelector = function( walls ) {
    this._queue.trigger( 'wallselector:displayed', walls );
};

Interface.prototype.notifyWallFirstTime = function( wall ) {
    this._queue.trigger( 'wall:firsttime', wall );

    this.displayBoardCreator();
};

Interface.prototype.enableControls = function( data ) {
    this._queue.trigger( 'controls:enabled' );
};

module.exports = Interface;
