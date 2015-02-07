var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require('fs');
var path = require('path');
var ip = require('ip');

var PORT = 1337;
var HAND_SIZE = 10;

function CAH() {
  this.game_state = 0;
  this.czar = null;
  this.black_card = null;
  this.players = {};
  this.white_deck = [];
  this.black_deck = [];
  this.white_graveyard = [];
  this.black_graveyard = [];
  this.played_cards = {};
  this.display_socket = null;
  this.player_count = 0;

  function Card(id, text) {
    this.id = id;
    this.text = text;
  }

  function Player(name, socket) {
    this.name = name;
    this.socket = socket;
    this.hand = [];
    this.score = 0;
  }

  this.getCards = function() {
    var filePath = path.join(__dirname, '../server/cah/cards/box.txt');
    var self = this;
    fs.readFile(filePath, {encoding: 'utf-8'}, function(err, data){
      if (!err){
        data = data.split("\n");
        for(var i in data) {
          var line = data[i];
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
    socket.emit('deal', (id, text));
  };

  this.sendState = function(socket, state) {
    socket.emit('update state', state);
  };

  this.sendRemoveCard = function(socket, id) {
    socket.emit('remove card', id);
  };

  this.sendAddPlayer = function(socket, name) {
    socket.emit('add player', name);
  };

  this.sendSetPlayerScore = function(socket, name, score) {
    socket.emit('set player score', (name, score));
  };

  this.sendRemovePlayer = function(socket, name) {
    socket.emit('remove player', name);
  };

  this.sendSetBCard = function(socket, id, text) {
    socket.emit('set bcard', (id, text));
  };

  this.sendAddWCard = function(socket, id, text) {
    socket.emit('add wcard', (id, text));
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
  /*End socket output functions*/

  this.removePlayer = function(socket) {
    this.player_count--;
    //TODO
  };

  this.drawWhiteCard = function() {
    var i = Math.floor(Math.random() * this.white_deck.length);
    return this.white_deck.splice(i, 1);
  };

  this.drawBlackCard = function() {
    var i = Math.floor(Math.random() * this.black_deck.length);
    var c = this.black_deck.splice(i, 1);
    if(this.display_socket != null){
      this.sendSetBCard(this.display_socket, c.id, c.text);
    };
    return c;
  };

  this.fillHands = function() {
    for(var sock in this.players) {
      while(this.players[sock].hand.length < HAND_SIZE) {
        var card = this.drawWhiteCard();
        this.players[sock].hand.push(card);
        this.sendDeal(this.players[sock].socket, (card.id, card.text));
      }
    }
  };

  this.startGame = function() {
    this.game_state = 1;
    for(sock in this.players){
      this.sendState(this.players[sock].socket, 1);
    }
    this.fillHands();
    this.black_card = this.drawBlackCard();
  };

  this.addPlayer = function(name, socket) {
    var player = new Player(name, socket);
    this.players[socket] = player;
    this.sendState(socket, 0);
    if(this.player_count == 0) { //TODO
      this.startGame();
    }
    this.player_count++;
  };

  this.addDisplay = function(socket) {
    this.display_socket = socket;
    for(var sock in this.players) {
      this.sendAddPlayer(socket, this.players[sock].name);
      this.sendSetPlayerScore(socket, this.players[sock].name,
        this.players[sock].score);
    }
    var url = 'http://' + ip.address() + ':' + PORT;
    this.sendSetQR(socket, url);
    //TODO: Send black card
    //TODO: Send white cards on the table, face up
  };

  this.playCard = function(socket, id) {
    for(var tcard in this.players[socket].hand){
      if(tcard.id === id){
        var card = tcard;
        var index = this.players[socket].hand.indexOf(card);
      }
    }
    if(this.game_state === 1 &&
       this.players[socket] != czar &&
       !(socket in this.played_cards)){
      this.played_cards[socket] = card;
      this.players[socket].hand.splice(index, 1);
      SendRemoveCard(socket, id);
      SendAddWCard(this.display_socket, card.id, card.text);
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
    //Tell game that a player joined
    cah.addPlayer(name, socket);
  });
  socket.on('play', function(id){
    //Tell game that a card was played
    cah.playCard(socket, id);
  });
  socket.on('czar flip', function(id){
    //Tell game that the czar flipped a card
  });
  socket.on('disconnect', function(){
    //Tell game that the player/display left

  });
  socket.on('register display', function(){
    //Tell the game a display has joined
    cah.addDisplay(socket);
  });
});

http.listen(PORT, function(){
  console.log('listening on *:1337');
});
