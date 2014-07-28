

function Pocket( data ) {
    for ( var prop in data ) {
        if ( prop === 'links' ) continue;

        var value = data[prop];

        this[prop] = (value === 'undefined' ? undefined : value);
    }

    this.cardlocations = [];
    this.regions = [];

    for ( var link in data.links ) {
        this[link] = data.links[link];
    }

    this.constructor = Pocket;
}

Pocket.prototype.getId = function() {
    return this.id;
};

Pocket.prototype.getTitle = function() {
    return this.title;
};

Pocket.prototype.getCardnumber = function() {
    return this.cardnumber;
};

Pocket.prototype.getContent = function() {
    return this.content;
};

Pocket.prototype.getTags = function() {
    return this.tags;
};

Pocket.prototype.getMentions = function() {
    return this.mentions;
};

Pocket.prototype.getWall = function() {
    return this.wall;
};

Pocket.prototype.getCardLocations = function() {
    return this.cardlocations;
};

Pocket.prototype.addCardLocation = function( cardlocation ) {
    if ( !~this.cardlocations.indexOf( cardlocation.id ) ) {
        this.cardlocations.push( cardlocation.id );
    }

    return this;
};

Pocket.prototype.getRegions = function() {
    return this.regions;
};

Pocket.prototype.addRegion = function( region ) {
    if ( !~this.regions.indexOf( region.id ) ) {
        this.regions.push( region.id );
    }

    return this;
};

Pocket.prototype.removeRegion = function( region ) {
    var loc = this.regions.indexOf( region.id );

    if ( ~loc ) {
        this.regions.splice( loc, 1 );
    }

    return this;
};

Pocket.constructor = function( data ) {
    if ( data instanceof Pocket ) {
        return data;
    }

    return new Pocket( data );
};

Pocket.schema = {
    title: String,
    cardnumber: Number,
    content: String,     // [ 'fragment' ]
    tags: String,        // [ 'tag' ]
    mentions: String,    // [ 'mention' ] --> 'user', 'group'
    color: String,
    wall: 'wall',
    cardlocation: ['cardlocation'],
    regions: ['region']
    , createdBy: 'user'
    , createdOn: Date
    , lastModifiedBy: 'user'
    , lastModifiedOn: Date
};

Pocket.validator = function( data ) {
    var validator = {
        validForUpdate: true
      , validForCreate: true
      , issues: []
    };

    if ( !data.id ) {
        validator.validForUpdate = false;
        validator.issues.push( 'ID is required' );
    }

    if ( !data.title || data.title === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Title is required' );
    }

    if ( !data.wall || data.wall === '' ) {
        validator.validForUpdate = validator.validForCreate = false;
        validator.issues.push( 'Wall is required' );
    }

    return validator;
};

Pocket.onBeforeUpdate = function ( data ) {
    // data.lastModifiedBy = app.getCurrentUser()._id;
    data.lastModifiedOn = new Date();

    return data;
};

Pocket.onBeforeCreate = function( data ) {
    // data.createdBy = app.getCurrentUser()._id;
    data.createdOn = new Date();

    return data;
};

module.exports = Pocket;
