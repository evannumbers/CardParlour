import re

FILE_IN = 'cah_cards.sql'

DIR_OUT = './'

WHITE_PATTERN = r'INSERT INTO white_cards VALUES \((\d+), \'(.+)\', \'?(\w+)\'?\);'
BLACK_PATTERN = r'INSERT INTO black_cards VALUES \((\d+), \'(.+)\', (\d+), (\d+), \'?(\w+)\'?\);'
HTML_PATTERN = r'\<[^\<\>]+\>[^\<\>]*\<[^\<\>]+\>'

results = dict()

def clean(text):
    text = re.sub(HTML_PATTERN, '', text)
    text = re.sub(r'\'\'', '\'', text)
    text = re.sub(r' \\ ', '<br>', text)
    return text

with open(FILE_IN, 'rb') as f:
    for line in f.readlines():
        matched = re.match(WHITE_PATTERN, line)
        if matched:
            card_id, card_text, card_group = matched.groups()
            card_text = clean(card_text)
            if card_group not in results:
                results[card_group] = []
            results[card_group].append('W|0|' + card_text)
            continue
        matched = re.match(BLACK_PATTERN, line)
        if matched:
            card_id, card_text, draw_num, play_num, card_group = matched.groups()
            card_text = clean(card_text)
            if card_group not in results:
                results[card_group] = []
            results[card_group].append('B|' + play_num + '|' + card_text)
            continue

for card_group in results:
    with open(DIR_OUT + card_group + '.cards', 'wb') as f:
        for card in results[card_group]:
            f.write(card + '\n')
