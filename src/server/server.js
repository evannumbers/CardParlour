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

function Player(name, socket, id) {
  this.name = name;
  this.id = id
  this.socket = socket;
  this.hand = [];
  this.score = 0;
}

function CAH() {
  this.game_state = 0;
  this.czar = null;
  this.black_card = null;
  this.players = [];
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
    for(var i = 0; i < this.czar_order.length; i++){
      if(this.czar_order[i] == player){
        this.czar_order.splice(i,1);
        break;
      }
    }
    for(var i = 0; i < this.pending_players.length; i++){
      if(this.pending_players[i] == player){
        this.pending_players.splice(i,1);
        break;
      }
    }
    for(var i = 0; i < this.players.length; i++){
      if(this.players[i] == player){
        this.players.splice(i,1);
        break;
      }
    }
    if(player == this.czar){
      this.startRound();
    }
  };

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
      while(this.players[i].hand.length < HAND_SIZE) {
        var card = this.drawWhiteCard();
        card.ownerID = this.players[i].id;
        card.flipped = false;
        this.players[i].hand.push(card);
        this.sendDeal(this.players[i].socket,
          card.id, card.text);
      }
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
    var ele = this.czar_order.shift();
    this.czar_order.push(ele);
    return ele;
  };

  this.startRound = function() {
    this.displayClearCards();
    for(var i = 0; i < this.played_cards.length; i++){
      this.white_graveyard.push(this.played_cards[i]);
    }
    this.played_cards = [];
    this.pending_players = this.czar_order.slice();
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
      player.hand.push(card);
      this.sendDeal(player.socket,
        card.id, card.text);
    }
  }

  this.newPlayerID = function(){
    var result = this.next_player_id;
    this.next_player_id++;
    return result;
  };

  this.addPlayer = function(player) {
    if(this.player_count >= MAX_PLAYERS) {
      this.sendState(player.socket, 0);
      console.log("Max players reached; new player rejected");
      return;
    }
    this.players.push(player);
    this.czar_order.push(player);
    if(this.game_state === 1){
      this.fillHand(player);
      this.sendState(player.socket, 1);
    } else {
      this.sendState(player.socket, 0);
    }
    this.displayAddPlayer(player);
    this.player_count++;
    if(this.player_count == 3) { //TODO
      this.startRound();
    }
  };

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
          for(var j = 0; j < this.players.length; j++){
            if(this.players[j].id == this.played_cards[i].ownerID){
              this.winner = this.players[j].name;
              this.displaySetWinner(this.winner);
              this.setPlayerScore(this.players[j],this.players[j].score + 1);
              break;
            }
          }
          break;
        }
      }
      setTimeout(this.cleanUpWinner.bind(this), WINNER_TIME);
    }
    else {
      for(var i = 0; i < player.hand.length; i++){
        if(player.hand[i].id == id){
          var card = player.hand[i];
          var index = i;
        }
      }
      //TODO: Place card in played_cards randomly and tell display
      var index = Math.floor(Math.random() * (this.played_cards.length + 1));
      this.played_cards.splice(index,0,card);
      player.hand.splice(index, 1)[0];
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
  socket.on('join', function(name){
    if (/[^A-Za-z0-9 ]/.test(name))
    {
      return;
    }
    //TODO: Make sure the display client can handle rejection
    pname = name;
    this.player = new Player(name, socket, cah.newPlayerID());
    cah.addPlayer(this.player);
  });
  socket.on('play', function(id){
    cah.playCard(this.player, id);
  });
  socket.on('czar flip', function(id){
    cah.flipWCard(id);
  });
  socket.on('disconnect', function(){
    if(this.player != null){
      cah.removePlayer(this.player);
    }
    cah.removeDisplay(socket);
  });
  socket.on('register display', function(){
    cah.addDisplay(socket);
  });
});

http.listen(PORT, function(){
  console.log('listening on *:1337');
});
