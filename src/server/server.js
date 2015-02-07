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
  this.czar_order = [];
  this.pending_players = [];

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
    var filePath = path.join(__dirname, '../server/cah/cards/version1.txt');
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

  this.sendAddPlayer = function(socket, name) {
    socket.emit('add player', name);
  };

  this.sendSetPlayerScore = function(socket, name, score) {
    socket.emit('set player score', name, score);
  };

  this.sendRemovePlayer = function(socket, name) {
    socket.emit('remove player', name);
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
  /*End socket output functions*/

  this.removePlayer = function(socket) {
    console.log(socket);
    if(this.players[socket] != null){
      this.player_count--;
      this.sendRemovePlayer(socket, name);
      czar_list.find(function(element, index, array){
        array.splice(index, 1);
      });
      for(var i = 0; i < pending_players.length; i++){
        if(pending_players[i] == this.players[socket]){
          pending_players.splice(i,1);
        }
      }
      delete this.player_list[socket];
    }
  };

  this.drawWhiteCard = function() {
    var i = Math.floor(Math.random() * this.white_deck.length);
    return this.white_deck.splice(i, 1)[0];
  };

  this.drawBlackCard = function() {
    var i = Math.floor(Math.random() * this.black_deck.length);
    var c = this.black_deck.splice(i, 1)[0];
    if(this.display_socket != null){
      console.log(c.text);
      this.sendSetBCard(this.display_socket, c.id, c.text);
    };
    return c;
  };

  this.fillHands = function() {
    for(var sock in this.players) {
      while(this.players[sock].hand.length < HAND_SIZE) {
        var card = this.drawWhiteCard();
        this.players[sock].hand.push(card);
        this.sendDeal(this.players[sock].socket, card.id, card.text);
      }
    }
  };

  this.chooseCzar = function() {
    var ele = this.czar_order.pop();
    this.czar_order.push(ele);
    return ele;
  }

  this.startRound = function() {
    this.pending_players = this.czar_order.slice();
    this.czar = this.chooseCzar();
    this.game_state = 1;
    for(sock in this.players){
      if(this.players[sock] == this.czar){
        this.sendState(this.players[sock].socket, 2);
      } else {
        this.sendState(this.players[sock].socket, 1);
      }
    }
    this.fillHands();
    this.black_card = this.drawBlackCard();
  };

  this.addPlayer = function(name, socket) {
    var player = new Player(name, socket);
    this.players[socket] = player;
    this.sendAddPlayer(socket, name);
    this.czar_order.push(player);
    this.sendState(socket, 0);
    if(this.display_socket != null){
      this.sendAddPlayer(this.display_socket, name);
      this.sendSetPlayerScore(this.display_socket, 0);
    }
    if(this.player_count == 0) { //TODO
      this.startRound();
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
    //TODO: Send white cards on the table, face up
  };

  this.czarPhase = function() {
    this.sendState(this.czar.socket, 4);
    for(var index in this.played_cards){
      this.sendDeal(this.czar.socket,(-1) * this.played_cards[index].id,
        this.played_cards[index].text);
    }
  };

  this.playCard = function(socket, id) {
    for(var tcard in this.players[socket].hand){
      if(this.players[socket].hand[tcard].id == id){
        var card = this.players[socket].hand[tcard];
        var index = this.players[socket].hand.indexOf(card);
      }
    }
//    if(this.game_state === 1 &&
//       this.players[socket] != this.czar &&
//       !(socket in this.played_cards)){
      this.played_cards[socket] = card;
      this.players[socket].hand.splice(index, 1)[0];
      this.sendState(socket, 3);
      this.sendRemoveCard(socket, id);
      this.sendAddWCard(this.display_socket, card.id, card.text);
      for(var i = 0; i < pending_players.length; i++){
        if(pending_players[i] == this.players[socket]){
          pending_players.splice(i,1);
        }
      }
      if(pending_players.length == 0) {
        this.czarPhase();
      }
//    }
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
    //cah.removePlayer(socket);
    //TODO: Fuck this
  });
  socket.on('register display', function(){
    //Tell the game a display has joined
    cah.addDisplay(socket);
  });
});

http.listen(PORT, function(){
  console.log('listening on *:1337');
});
