var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require('fs');
var path = require('path');
var ip = require('ip');

var PORT = 1337;
var HAND_SIZE = 10;

function Player(name, socket) {
  this.name = name;
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
  this.played_cards = {};
  this.display_socket = null;
  this.player_count = 0;
  this.czar_order = [];
  this.pending_players = [];

  function Card(id, text) {
    this.id = id;
    this.text = text;
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

  this.removePlayer = function(player) {
    //console.log(socket);
    this.player_count--;
    this.sendRemovePlayer(player.socket, player.name);
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
    for(var player in this.players) {
      while(this.players[player].hand.length < HAND_SIZE) {
        var card = this.drawWhiteCard();
        this.players[player].hand.push(card);
        this.sendDeal(this.players[player].socket,
          card.id, card.text);
      }
    }
  };

  this.chooseCzar = function() {
    var ele = this.czar_order.shift();
    this.czar_order.push(ele);
    return ele;
  }

  this.startRound = function() {
    this.played_cards = {};
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
  };

  this.fillHand = function(player) {
    while(player.hand.length < HAND_SIZE) {
      var card = this.drawWhiteCard();
      player.hand.push(card);
      this.sendDeal(player.socket,
        card.id, card.text);
    }
  }

  this.addPlayer = function(player) {
    this.players.push(player);
    //console.log(this.players);
    this.sendAddPlayer(player.socket, player.name);
    this.czar_order.push(player);
    if(this.game_state === 1){
      this.fillHand(player);
      this.sendState(player.socket, 1);
    } else {
      this.sendState(player.socket, 0);
    }
    if(this.display_socket != null){
      this.sendAddPlayer(this.display_socket, player.name);
      this.sendSetPlayerScore(this.display_socket, player.name, 0);
    }
    this.player_count++;
    if(this.player_count == 3) { //TODO
      this.startRound();
    }
  };

  this.addDisplay = function(socket) {
    this.display_socket = socket;
    for(var player in this.players) {
      this.sendAddPlayer(socket, player.name);
      this.sendSetPlayerScore(socket, player.name, player.score);
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
    this.game_state = 2;
  };

  this.playCard = function(player, id) {
    if(id < 0 && player == this.czar) {
      //The Czar selects the winner
      for(var i in this.played_cards) {
        if(this.played_cards[i].id == (-1*id)) {
          for(j in this.players){
            if(this.players[j].name == i){
              this.players[j].score++;
              this.sendSetPlayerScore(this.display_socket,i,this.players[j].score);
              this.sendClearCards(this.display_socket);
              break;
            }
          }
          break;
        }
      }
      this.startRound();
    } else {
    for(var tcard in player.hand){
      if(player.hand[tcard].id == id){
        var card = player.hand[tcard];
        var index = player.hand.indexOf(card);
      }
    }
      this.played_cards[player.name] = card;
      player.hand.splice(index, 1)[0];
      this.sendState(player.socket, 3);
      this.sendRemoveCard(player.socket, id);
      this.sendAddWCard(this.display_socket, card.id, card.text);
      for(var i = 0; i < this.pending_players.length; i++){
        if(this.pending_players[i] == player){
          this.pending_players.splice(i,1);
        }
      }
      console.log(this.played_cards);
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
    this.player = new Player(name, socket);
    cah.addPlayer(this.player);
  });
  socket.on('play', function(id){
    cah.playCard(this.player, id);
  });
  socket.on('czar flip', function(id){
    cah.sendFlipWCard(cah.display_socket, id);
  });
  socket.on('disconnect', function(){
    if(this.player != null){
      cah.removePlayer(this.player);
    }
  });
  socket.on('register display', function(){
    cah.addDisplay(socket);
  });
});

http.listen(PORT, function(){
  console.log('listening on *:1337');
});
