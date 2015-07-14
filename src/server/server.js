var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require('fs');
var path = require('path');
var ip = require('ip');

var PORT = 1337;
var HAND_SIZE = 10;
var MAX_PLAYERS = 10;
var WINNER_TIME = 5000;
var MAX_INACTIVE_ROUNDS = 1;
var NAME_REQUIREMENTS = /[A-Za-z0-9 ]{1,}/;

function socketIP(socket){
  return socket.request.connection.remoteAddress;
}

function Player(name, socket, id) {
  this.name = name;
  this.id = id;
  this.ip = socketIP(socket);
  this.socket = socket;
  this.hand = [];
  this.score = 0;
  this.active = true;
  this.inactive_count = 0;
}

function CAH() {
  this.game_state = 0;
  this.czar = null;
  this.black_card = null;
  this.players = [];
  this.inactive_players = [];
  this.white_deck = [];
  this.black_deck = [];
  this.white_graveyard = [];
  this.black_graveyard = [];
  this.played_cards = [];
  this.player_count = 0;
  this.czar_order = [];
  this.pending_players = [];
  this.next_player_id = 0;
  this.displays = [];
  this.winner = "";

  function Card(id, text) {
    this.id = id;
    this.text = text;
    this.ownerID = -1;
    this.flipped = false;
  }

  this.getCards = function() {
    var filePath = path.join(__dirname, '../server/cah/cards/combo.txt');
    var self = this;
    fs.readFile(filePath, {encoding: 'utf-8'}, function(err, data){
      if (!err){
        data = data.split("\n");
        for(var i in data) {
          var line = data[i];

          /* Ignore the empty line cause by the final newline */
          if(line == "")
          {
            continue;
          }

          var elements = line.split("|");

          var type = elements[0];
          var numCards = elements[1];
          var desc = elements[2];

          if(numCards > 1) {
            continue;
          }

          var newCard = new Card(i, desc);
          if(type == 'W') {
            self.white_deck.push(newCard);
          } else {
            self.black_deck.push(newCard);
          }
        }
      } else {
          console.log(err);
      }
    });
  }

  /*Begin socket output functions*/
  this.sendDeal = function(socket, id, text) {
    socket.emit('deal', id, text);
  };

  this.sendState = function(socket, state) {
    socket.emit('update state', state);
  };

  this.sendRemoveCard = function(socket, id) {
    socket.emit('remove card', id);
  };

  this.sendAddPlayer = function(socket, name, id) {
    socket.emit('add player', name, id);
  };

  this.sendSetPlayerScore = function(socket, id, score) {
    socket.emit('set player score', id, score);
  };

  this.sendRemovePlayer = function(socket, id) {
    socket.emit('remove player', id);
  };

  this.sendDeactivatePlayer = function(socket, id) {
    socket.emit('deactivate player', id);
  };

  this.sendActivatePlayer = function(socket, id) {
    socket.emit('activate player', id);
  };

  this.sendChooseCzar = function(socket, id) {
    socket.emit('choose czar', id);
  };

  this.sendSetBCard = function(socket, id, text) {
    socket.emit('set bcard', id, text);
  };

  this.sendAddWCard = function(socket, id, text) {
    socket.emit('add wcard', id, text);
  };

  this.sendFlipWCard = function(socket, id) {
    socket.emit('flip wcard', id);
  };

  this.sendClearCards = function(socket) {
    socket.emit('clear cards', 0);
  };

  this.sendSetQR = function(socket, url) {
    socket.emit('set qr', url);
  };

  this.sendSetWinner = function(socket, name) {
    socket.emit('set winner', name);
  };
  /*End socket output functions*/

  this.removePlayer = function(player) {
    this.player_count--;
    this.displayRemovePlayer(player);
    // Remove player from czar order
    for(var i = 0; i < this.czar_order.length; i++){
      if(this.czar_order[i] == player){
        this.czar_order.splice(i,1);
        break;
      }
    }
  };

  this.deactivatePlayer = function(player) {
    player.active = false;
    this.displayDeactivatePlayer(player);
    // Remove player from pending_players
    for(var i = 0; i < this.pending_players.length; i++){
      if(this.pending_players[i] == player){
        this.pending_players.splice(i,1);
        break;
      }
    }
    // Remove player from player list
    for(var i = 0; i < this.players.length; i++){
      if(this.players[i] == player){
        this.players.splice(i,1);
        break;
      }
    }
    this.inactive_players.push(player);
    player.inactive_count = 0;
    // If the player who left was czar, start a new round
    if(player == this.czar && this.game_state != 3){
      if(this.game_state == 1){
        this.giveBackCards();
      }
      this.startRound();
    }
    else if(this.pending_players.length == 1) {
      this.czarPhase();
    }
  };

  this.giveBackCards = function() {
    for(var i=0; i<this.played_cards.length; i++){
      card = this.played_cards[i];
      var all_players = this.players.concat(this.inactive_players)
      var given = false;
      for(var j = 0; j < all_players.length; j++){
        var player = all_players[j];
        if(player.id == card.ownerID){
          player.hand.push(card);
          given = true;
          this.sendDeal(player.socket, card.id, card.text);
        }
      }
      if(!given){
        this.white_graveyard.push(card);
      }
    }
    this.played_cards = [];
  }

  this.drawWhiteCard = function() {
    var i = Math.floor(Math.random() * this.white_deck.length);
    var result = this.white_deck.splice(i, 1)[0];
    if(this.white_deck.length == 0)
    {
      this.white_deck = this.white_graveyard;
      this.white_graveyard = [];
    }
    return result;
  };

  this.drawBlackCard = function() {
    var i = Math.floor(Math.random() * this.black_deck.length);
    var c = this.black_deck.splice(i, 1)[0];
    this.black_graveyard.push(c);
    if(this.black_deck.length == 0)
    {
      this.black_deck = this.black_graveyard;
      this.black_graveyard = [];
    }
    return c;
  };

  this.fillHands = function() {
    for(var i = 0; i < this.players.length; i++) {
      this.fillHand(this.players[i]);
    }
  };

  this.flipWCard = function(id){
    for(var i = 0; i < this.played_cards.length; i++){
      var c = this.played_cards[i];
      if(c.id == id){
        c.flipped = true;
      }
    }
    this.displayFlipWCard(id);
  };

  this.chooseCzar = function() {
    var player = this.czar_order.shift();
    this.czar_order.push(player);
    while(player.active == false){
      player = this.czar_order.shift();
      this.czar_order.push(player)
    }
    this.displayChooseCzar(player);
    return player;
  };

  this.startRound = function() {
    // Increment inactive count
    for(var i = 0; i < this.inactive_players.length; i++){
      if(this.inactive_players[i].inactive_count < MAX_INACTIVE_ROUNDS){
        this.inactive_players[i].inactive_count++;
      }
      else{
        this.removePlayer(this.inactive_players.splice(i,1)[0]);
        i--;
      }
    }
    this.displayClearCards();
    for(var i = 0; i < this.played_cards.length; i++){
      this.white_graveyard.push(this.played_cards[i]);
    }
    this.played_cards = [];
    this.pending_players = this.players.slice();
    this.czar = this.chooseCzar();
    this.game_state = 1;
    for(player in this.players){
      if(this.players[player] == this.czar){
        this.sendState(this.players[player].socket, 2);
      } else {
        this.sendState(this.players[player].socket, 1);
      }
    }
    this.fillHands();
    this.black_card = this.drawBlackCard();
    this.displaySetBCard(this.black_card);
  };

  this.fillHand = function(player) {
    while(player.hand.length < HAND_SIZE) {
      var card = this.drawWhiteCard();
      card.ownerID = player.id;
      card.flipped = false;
      player.hand.push(card);
      this.sendDeal(player.socket, card.id, card.text);
    }
  }

  this.newPlayerID = function(){
    var result = this.next_player_id;
    this.next_player_id++;
    return result;
  };

  this.refreshCards = function(player) {
    for(var i=0; i<player.hand.length; i++) {
      this.sendDeal(player.socket, player.hand[i].id, player.hand[i].text);
    }
  }

  this.addPlayer = function(player, already_here) {
    if(!already_here && this.player_count >= MAX_PLAYERS) {
      this.sendState(player.socket, 0);
      console.log("Max players reached; new player rejected");
      return;
    }
    this.players.push(player);
    this.pending_players.push(player);
    if(already_here) {
      player.active = true;
      this.displayActivatePlayer(player);
      this.refreshCards(player);
    }
    else {
      this.czar_order.push(player);
      this.player_count++;
      this.displayAddPlayer(player);
    }
    if(this.game_state == 1){
      this.fillHand(player);
      this.sendState(player.socket, 1);
    }
    else {
      this.sendState(player.socket, 0);
    }
    if(this.player_count == 3 && this.game_state == 0) { //TODO
      this.startRound();
    }
  };

  // Reactivate a previously disconnected player, returns true iff succeeds
  this.activatePlayer = function(name, socket) {
    var ip = socketIP(socket)
    for(var i = 0; i < this.inactive_players.length; i++) {
      if(this.inactive_players[i].name == name &&
         this.inactive_players[i].ip == ip){
        var player = this.inactive_players.splice(i,1)[0]
        player.socket = socket;
        this.addPlayer(player, true)
        return player;
      }
    }
    return null;
  }

  this.setPlayerScore = function(player, score) {
    player.score = score;
    this.displayUpdatePlayerScore(player);
  };

  this.displayClearCards = function(){
    for(var i = 0; i < this.displays.length; i++)
    {
      var d = this.displays[i];
      this.sendClearCards(d);
    }
  };

  this.displaySetBCard = function(card){
    for(var i = 0; i < this.displays.length; i++)
    {
      var d = this.displays[i];
      this.sendSetBCard(d, card.id, card.text);
    }
  };

  this.displayAddWCard = function(card){
    for(var i = 0; i < this.displays.length; i++)
    {
      var d = this.displays[i];
      this.sendAddWCard(d, card.id, card.text);
    }
  };

  this.displaySetWinner = function(name){
    for(var i = 0; i < this.displays.length; i++)
    {
      var d = this.displays[i];
      this.sendSetWinner(d, name);
    }
  };

  this.displayFlipWCard = function(id){
    for(var i = 0; i < this.displays.length; i++)
    {
      var d = this.displays[i];
      this.sendFlipWCard(d, id);
    }
  };

  this.displayUpdatePlayerScore = function(player){
    for(var i = 0; i < this.displays.length; i++)
    {
      var d = this.displays[i];
      this.sendSetPlayerScore(d, player.id, player.score);
    }
  };

  this.displayAddPlayer = function(player){
    for(var i = 0; i < this.displays.length; i++)
    {
      var d = this.displays[i];
      this.sendAddPlayer(d, player.name, player.id);
      this.sendSetPlayerScore(d, player.id, 0);
    }
  };

  this.displayRemovePlayer = function(player){
    for(var i = 0; i < this.displays.length; i++)
    {
      var d = this.displays[i];
      this.sendRemovePlayer(d, player.id);
    }
  };

  this.displayDeactivatePlayer = function(player){
    for(var i = 0; i < this.displays.length; i++)
    {
      var d = this.displays[i];
      this.sendDeactivatePlayer(d, player.id);
    }
  };

  this.displayActivatePlayer = function(player){
    for(var i = 0; i < this.displays.length; i++)
    {
      var d = this.displays[i];
      this.sendActivatePlayer(d, player.id);
    }
  };

  this.displayChooseCzar = function(player){
    for(var i = 0; i < this.displays.length; i++)
    {
      var d = this.displays[i];
      this.sendChooseCzar(d, player.id);
    }
  };

  this.setUpDisplay = function(socket){
    for(var i = 0; i < this.players.length; i++) {
      var player = this.players[i];
      this.sendAddPlayer(socket, player.name, player.id);
      this.sendSetPlayerScore(socket, player.id, player.score);
    }
    if(this.black_card != null) {
      this.sendSetBCard(socket, this.black_card.id, this.black_card.text);
    }
    for(var i = 0; i < this.played_cards.length; i++) {
      var card = this.played_cards[i];
      this.sendAddWCard(socket, card.id, card.text);
      if(card.flipped){
        this.sendFlipWCard(socket, card.id);
      }
    }
    if(this.czar != null){
      this.sendChooseCzar(socket, this.czar.id);
    }
    this.sendSetWinner(socket, this.winner);
    var url = 'http://' + ip.address() + ':' + PORT;
    this.sendSetQR(socket, url);
  };

  this.addDisplay = function(socket) {
    this.displays.push(socket);
    this.setUpDisplay(socket);
  };

  this.removeDisplay = function(socket) {
    for(var i = 0; i < this.displays.length; i++)
    {
      if(this.displays[i] == socket)
      {
        this.displays.splice(i,1);
        break;
      }
    }
  };

  this.czarPhase = function() {
    this.sendState(this.czar.socket, 4);
    for(var i = 0; i < this.played_cards.length; i++){
      this.sendDeal(this.czar.socket,(-1) * this.played_cards[i].id,
        this.played_cards[i].text);
    }
    this.game_state = 2;
  };

  this.cleanUpWinner = function() {
    this.winner = "";
    this.displaySetWinner(this.winner);
    this.startRound();
  };

  this.playCard = function(player, id) {
    if(id < 0 && player == this.czar) {
      //The Czar selects the winner
      this.displayClearCards();
      for(var i = 0; i < this.played_cards.length; i++) {
        if(this.played_cards[i].id == (-1*id)) {
          this.displayAddWCard(this.played_cards[i]);
          this.displayFlipWCard(this.played_cards[i].id);
          var all_players = this.players.concat(this.inactive_players)
          for(var j = 0; j < all_players.length; j++){
            if(all_players[j].id == this.played_cards[i].ownerID){
              this.winner = all_players[j].name;
              this.displaySetWinner(this.winner);
              this.setPlayerScore(all_players[j],all_players[j].score + 1);
              break;
            }
          }
          break;
        }
      }
      this.game_state = 3;
      setTimeout(this.cleanUpWinner.bind(this), WINNER_TIME);
    }
    //Not the czar, just someone playing a card
    else {
      for(var i = 0; i < player.hand.length; i++){
        if(player.hand[i].id == id){
          var card = player.hand.splice(i, 1)[0];
          var index = i;
        }
      }
      //TODO: Place card in played_cards randomly and tell display
      var index = Math.floor(Math.random() * (this.played_cards.length + 1));
      //Doesn't remove anything, inserts card at index
      this.played_cards.splice(index,0,card);
      this.sendState(player.socket, 3);
      this.sendRemoveCard(player.socket, id);
      this.displayClearCards();
      for(var i = 0; i < this.played_cards.length; i++){
        this.displayAddWCard(this.played_cards[i]);
      }
      for(var i = 0; i < this.pending_players.length; i++){
        if(this.pending_players[i] == player){
          this.pending_players.splice(i,1);
        }
      }
      if(this.pending_players.length == 1) {
        this.czarPhase();
      }
    }
  }
}

var cah = new CAH();
cah.getCards();

app.use('/style', express.static('../style'));
app.get('/', function(req, res){
  res.sendFile('clients/player.html', {'root': '../'});

});

app.get('/display', function(req, res){
  res.sendFile('clients/display.html', {'root': '../'});
});

io.on('connection', function(socket){
  console.log("client connected");
  socket.emit('ping', 0);
  socket.on('join', function(name){
    if (!NAME_REQUIREMENTS.test(name))
    {
      return;
    }
    //TODO: Make sure the display client can handle rejection
    this.player = cah.activatePlayer(name, socket);
    if(this.player == null){
      this.player = new Player(name, socket, cah.newPlayerID());
      cah.addPlayer(this.player, false);
    }
  });
  socket.on('play', function(id){
    cah.playCard(this.player, id);
  });
  socket.on('czar flip', function(id){
    cah.flipWCard(id);
  });
  socket.on('disconnect', function(){
    if(this.player != null){
      cah.deactivatePlayer(this.player);
    }
    cah.removeDisplay(socket);
  });
  socket.on('register display', function(){
    cah.addDisplay(socket);
  });
  socket.on('pong', function(name){
    if(NAME_REQUIREMENTS.test(name)){
      this.player = cah.activatePlayer(name, socket);
    }
  });
});

http.listen(PORT, function(){
  console.log('listening on *:1337');
});
