import unittest

from noteapp.markdown_blocks import blocks_to_markdown, parse_markdown_to_blocks


def to_plain(blocks):
    return [(b.type, b.level, b.text, b.checked, to_plain(b.children)) for b in blocks]


class MarkdownBlocksTests(unittest.TestCase):
    def test_heading_levels(self):
        blocks = parse_markdown_to_blocks('## Sub heading\n')
        self.assertEqual(blocks[0].type, 'heading')
        self.assertEqual(blocks[0].level, 2)
        self.assertEqual(blocks[0].text, 'Sub heading')

    def test_nested_list_items(self):
        text = (
            '- item one\n'
            '  - nested item\n'
            '    - deeper item\n'
            '- item two\n'
        )
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(len(blocks), 2)
        self.assertEqual(blocks[0].text, 'item one')
        self.assertEqual(blocks[0].children[0].text, 'nested item')
        self.assertEqual(blocks[0].children[0].children[0].text, 'deeper item')
        self.assertEqual(blocks[1].text, 'item two')
        self.assertEqual(blocks[1].children, [])

    def test_round_trip_stability(self):
        text = (
            '# Title\n'
            '- item one\n'
            '  - nested item\n'
            '- item two\n'
            'plain paragraph\n'
        )
        blocks = parse_markdown_to_blocks(text)
        serialized = blocks_to_markdown(blocks)
        blocks_again = parse_markdown_to_blocks(serialized)
        self.assertEqual(to_plain(blocks), to_plain(blocks_again))

    def test_blank_line_resets_list_nesting(self):
        text = (
            '- item one\n'
            '  - nested item\n'
            '\n'
            '- item two\n'
        )
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(len(blocks), 2)
        self.assertEqual(blocks[1].children, [])

    def test_quote_block(self):
        blocks = parse_markdown_to_blocks('> quoted text\n')
        self.assertEqual(blocks[0].type, 'quote')
        self.assertEqual(blocks[0].text, 'quoted text')

    def test_ordered_list_numbering(self):
        text = (
            '1. first\n'
            '2. second\n'
            '3. third\n'
        )
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual([b.type for b in blocks], ['ordered_item'] * 3)
        self.assertEqual([b.text for b in blocks], ['first', 'second', 'third'])
        serialized = blocks_to_markdown(blocks)
        self.assertEqual(serialized, text)

    def test_ordered_list_renumbers_after_reorder(self):
        blocks = parse_markdown_to_blocks('1. a\n2. b\n')
        blocks.reverse()
        serialized = blocks_to_markdown(blocks)
        self.assertEqual(serialized, '1. b\n2. a\n')

    def test_checklist_checked_and_unchecked(self):
        text = (
            '- [ ] todo item\n'
            '- [x] done item\n'
        )
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(blocks[0].type, 'checklist_item')
        self.assertFalse(blocks[0].checked)
        self.assertEqual(blocks[1].type, 'checklist_item')
        self.assertTrue(blocks[1].checked)
        self.assertEqual(blocks_to_markdown(blocks), text)

    def test_nested_ordered_and_checklist_round_trip(self):
        text = (
            '- parent\n'
            '  1. step one\n'
            '  2. step two\n'
            '- [ ] follow up\n'
        )
        blocks = parse_markdown_to_blocks(text)
        serialized = blocks_to_markdown(blocks)
        blocks_again = parse_markdown_to_blocks(serialized)
        self.assertEqual(to_plain(blocks), to_plain(blocks_again))

    def test_from_dict_round_trip_checked_field(self):
        from noteapp.markdown_blocks import Block
        block = Block.from_dict({'type': 'checklist_item', 'text': 'x', 'checked': True, 'children': []})
        self.assertTrue(block.checked)
        self.assertEqual(block.to_dict()['checked'], True)

    def test_table_basic_parse(self):
        text = (
            '| 項目 | 每月金額 |\n'
            '| ---- | ----------: |\n'
            '| 飲食 | $24,000 |\n'
            '| 房租 | $17,000 |\n'
        )
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0].type, 'table')
        self.assertEqual(blocks[0].rows, [
            ['項目', '每月金額'],
            ['飲食', '$24,000'],
            ['房租', '$17,000'],
        ])
        self.assertEqual(blocks[0].align, [None, 'right'])

    def test_table_alignment_markers(self):
        text = (
            '| a | b | c |\n'
            '| :--- | :---: | ---: |\n'
            '| 1 | 2 | 3 |\n'
        )
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(blocks[0].align, ['left', 'center', 'right'])

    def test_table_ends_at_blank_line_or_non_table_row(self):
        text = (
            '| a | b |\n'
            '| --- | --- |\n'
            '| 1 | 2 |\n'
            '\n'
            'plain paragraph\n'
        )
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(len(blocks), 2)
        self.assertEqual(blocks[0].type, 'table')
        self.assertEqual(blocks[1].type, 'paragraph')

    def test_table_row_without_separator_is_plain_paragraphs(self):
        text = '| not a table | just text |\n'
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(blocks[0].type, 'paragraph')

    def test_table_round_trip(self):
        text = (
            '| a | b |\n'
            '| :--- | ---: |\n'
            '| 1 | 2 |\n'
            '| **3** | 4 |\n'
        )
        blocks = parse_markdown_to_blocks(text)
        serialized = blocks_to_markdown(blocks)
        blocks_again = parse_markdown_to_blocks(serialized)
        self.assertEqual(blocks[0].rows, blocks_again[0].rows)
        self.assertEqual(blocks[0].align, blocks_again[0].align)

    def test_table_serialize_pads_ragged_rows(self):
        from noteapp.markdown_blocks import Block
        block = Block('table', rows=[['a', 'b'], ['1']], align=[])
        serialized = blocks_to_markdown([block])
        self.assertEqual(serialized, '| a | b |\n| --- | --- |\n| 1 |  |\n')


if __name__ == '__main__':
    unittest.main()
