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

    def test_table_row_wrapped_onto_next_line_is_joined(self):
        md = '| a | b | c |\n| --- | --- | --- |\n| 1 | 2\n3 | x |\n| 4 | 5 | 6 |'
        blocks = parse_markdown_to_blocks(md)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0].rows, [['a', 'b', 'c'], ['1', '2 3', 'x'], ['4', '5', '6']])

    def test_table_cell_line_break_round_trips_as_br(self):
        md = '| a | b |\n| --- | --- |\n| x<br>y | z |'
        blocks = parse_markdown_to_blocks(md)
        self.assertEqual(blocks[0].rows[1], ['x\ny', 'z'])
        self.assertEqual(blocks_to_markdown(blocks).strip(), md)

    def test_details_open_flag_round_trip(self):
        for md, is_open, title in [
            ('::: details open Title\nx\n:::', True, 'Title'),
            ('::: details open\nx\n:::', True, ''),
            ('::: details Title\nx\n:::', False, 'Title'),
            ('::: details closed open the door\nx\n:::', False, 'open the door'),
        ]:
            blocks = parse_markdown_to_blocks(md)
            self.assertEqual(blocks[0].calloutOpen, is_open, md)
            self.assertEqual(blocks[0].calloutTitle, title, md)
            self.assertEqual(blocks_to_markdown(blocks).strip(), md)

    def test_list_item_continuation_lines_round_trip(self):
        md = '1. first\n   second\n2. next\n- a\n  - b\n    cont'
        blocks = parse_markdown_to_blocks(md)
        self.assertEqual(blocks[0].text, 'first\nsecond')
        self.assertEqual(len(blocks), 3)
        self.assertEqual(blocks[2].children[0].text, 'b\ncont')
        self.assertEqual(blocks_to_markdown(blocks).strip(), md)

    def test_indented_line_after_blank_line_is_not_a_continuation(self):
        blocks = parse_markdown_to_blocks('- a\n\n  b')
        self.assertEqual([b.type for b in blocks], ['list_item', 'paragraph'])

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

    def test_adjacent_tables_serialize_with_blank_line_between(self):
        from noteapp.markdown_blocks import Block
        table1 = Block('table', rows=[['a', 'b'], ['1', '2']], align=[None, None])
        table2 = Block('table', rows=[['c', 'd'], ['3', '4']], align=[None, None])
        serialized = blocks_to_markdown([table1, table2])
        self.assertEqual(
            serialized,
            '| a | b |\n| --- | --- |\n| 1 | 2 |\n\n| c | d |\n| --- | --- |\n| 3 | 4 |\n',
        )

    def test_adjacent_tables_round_trip_stays_separate(self):
        text = (
            '| a | b |\n'
            '| --- | --- |\n'
            '| 1 | 2 |\n'
            '\n'
            '| c | d | e |\n'
            '| --- | --- | --- |\n'
            '| 3 | 4 | 5 |\n'
        )
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(len(blocks), 2)
        serialized = blocks_to_markdown(blocks)
        blocks_again = parse_markdown_to_blocks(serialized)
        self.assertEqual(len(blocks_again), 2)
        self.assertEqual(blocks_again[0].rows, [['a', 'b'], ['1', '2']])
        self.assertEqual(blocks_again[1].rows, [['c', 'd', 'e'], ['3', '4', '5']])

    def test_table_not_followed_by_table_has_no_extra_blank_line(self):
        from noteapp.markdown_blocks import Block
        table = Block('table', rows=[['a', 'b'], ['1', '2']], align=[None, None])
        paragraph = Block('paragraph', text='after')
        serialized = blocks_to_markdown([table, paragraph])
        self.assertEqual(serialized, '| a | b |\n| --- | --- |\n| 1 | 2 |\nafter\n')

    def test_image_basic_parse(self):
        blocks = parse_markdown_to_blocks('![a photo](photo.png)\n')
        self.assertEqual(blocks[0].type, 'image')
        self.assertEqual(blocks[0].text, 'a photo')
        self.assertEqual(blocks[0].src, 'photo.png')

    def test_image_empty_alt(self):
        blocks = parse_markdown_to_blocks('![](photo.png)\n')
        self.assertEqual(blocks[0].type, 'image')
        self.assertEqual(blocks[0].text, '')
        self.assertEqual(blocks[0].src, 'photo.png')

    def test_image_round_trip(self):
        text = '# Title\n![a photo](photo.png)\n- item\n'
        blocks = parse_markdown_to_blocks(text)
        serialized = blocks_to_markdown(blocks)
        self.assertEqual(serialized, text)

    def test_image_line_with_extra_text_is_not_an_image_block(self):
        blocks = parse_markdown_to_blocks('see ![a photo](photo.png) above\n')
        self.assertEqual(blocks[0].type, 'paragraph')

    def test_hr_basic_parse(self):
        blocks = parse_markdown_to_blocks('above\n\n---\n\nbelow\n')
        self.assertEqual([b.type for b in blocks], ['paragraph', 'hr', 'paragraph'])

    def test_hr_accepts_asterisks_and_underscores(self):
        for marker in ('***', '___', '----', '-----'):
            blocks = parse_markdown_to_blocks(marker + '\n')
            self.assertEqual(blocks[0].type, 'hr', marker)

    def test_hr_requires_no_other_content_on_the_line(self):
        blocks = parse_markdown_to_blocks('-- not enough dashes\n')
        self.assertEqual(blocks[0].type, 'paragraph')

    def test_hr_adjacent_to_another_hr_stays_separate(self):
        blocks = parse_markdown_to_blocks('---\n---\n')
        self.assertEqual([b.type for b in blocks], ['hr', 'hr'])

    def test_hr_round_trip(self):
        text = 'above\n---\nbelow\n'
        blocks = parse_markdown_to_blocks(text)
        serialized = blocks_to_markdown(blocks)
        self.assertEqual(serialized, text)

    def test_hr_not_confused_with_table_separator_row(self):
        text = '| a | b |\n| --- | --- |\n| 1 | 2 |\n'
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(blocks[0].type, 'table')
        self.assertEqual(len(blocks), 1)

    def test_code_block_with_language(self):
        text = '```python\nprint(1)\nif True:\n    print(2)\n```\n'
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(blocks[0].type, 'code_block')
        self.assertEqual(blocks[0].lang, 'python')
        self.assertEqual(blocks[0].text, 'print(1)\nif True:\n    print(2)')

    def test_code_block_without_language(self):
        blocks = parse_markdown_to_blocks('```\nhello\n```\n')
        self.assertEqual(blocks[0].type, 'code_block')
        self.assertEqual(blocks[0].lang, '')
        self.assertEqual(blocks[0].text, 'hello')

    def test_code_block_empty(self):
        blocks = parse_markdown_to_blocks('```\n```\n')
        self.assertEqual(blocks[0].type, 'code_block')
        self.assertEqual(blocks[0].text, '')

    def test_code_block_unterminated_runs_to_end_of_file(self):
        blocks = parse_markdown_to_blocks('```python\nline1\nline2')
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0].type, 'code_block')
        self.assertEqual(blocks[0].text, 'line1\nline2')

    def test_code_block_content_not_reparsed_as_other_syntax(self):
        text = '```\n# not a heading\n- not a list\n```\n'
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0].type, 'code_block')
        self.assertEqual(blocks[0].text, '# not a heading\n- not a list')

    def test_code_block_round_trip(self):
        text = '# Title\n```python\nprint(1)\nif True:\n    print(2)\n```\n- item\n'
        blocks = parse_markdown_to_blocks(text)
        serialized = blocks_to_markdown(blocks)
        self.assertEqual(serialized, text)

    def test_callout_basic_parse(self):
        text = '> [!NOTE]\n> hello world\n'
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(blocks[0].type, 'callout')
        self.assertEqual(blocks[0].calloutKind, 'note')
        self.assertEqual(blocks[0].text, 'hello world')

    def test_callout_multiline_body(self):
        text = '> [!WARNING]\n> line one\n> line two\n> line three\n'
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(blocks[0].type, 'callout')
        self.assertEqual(blocks[0].calloutKind, 'warning')
        self.assertEqual(blocks[0].text, 'line one\nline two\nline three')

    def test_callout_all_kinds_case_insensitive(self):
        for kind in ('note', 'tip', 'important', 'warning', 'caution'):
            blocks = parse_markdown_to_blocks('> [!%s]\n> body\n' % kind.upper())
            self.assertEqual(blocks[0].type, 'callout')
            self.assertEqual(blocks[0].calloutKind, kind)

    def test_callout_empty_body(self):
        blocks = parse_markdown_to_blocks('> [!NOTE]\n')
        self.assertEqual(blocks[0].type, 'callout')
        self.assertEqual(blocks[0].text, '')

    def test_callout_stops_at_blank_line(self):
        text = '> [!NOTE]\n> body\n\nplain paragraph\n'
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(len(blocks), 2)
        self.assertEqual(blocks[0].type, 'callout')
        self.assertEqual(blocks[1].type, 'paragraph')

    def test_callout_stops_at_next_callout_marker(self):
        text = '> [!NOTE]\n> first\n> [!TIP]\n> second\n'
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(len(blocks), 2)
        self.assertEqual(blocks[0].calloutKind, 'note')
        self.assertEqual(blocks[0].text, 'first')
        self.assertEqual(blocks[1].calloutKind, 'tip')
        self.assertEqual(blocks[1].text, 'second')

    def test_callout_unrecognized_kind_falls_back_to_quote(self):
        blocks = parse_markdown_to_blocks('> [!FOO]\n')
        self.assertEqual(blocks[0].type, 'quote')
        self.assertEqual(blocks[0].text, '[!FOO]')

    def test_callout_round_trip(self):
        text = '# Title\n::: important\nline one\nline two\n:::\n- item\n'
        blocks = parse_markdown_to_blocks(text)
        serialized = blocks_to_markdown(blocks)
        self.assertEqual(serialized, text)

    def test_callout_from_dict_default_kind(self):
        from noteapp.markdown_blocks import Block
        block = Block.from_dict({'type': 'callout', 'text': 'x', 'children': []})
        self.assertEqual(block.calloutKind, 'note')

    def test_callout_legacy_syntax_upgraded_to_fence_on_serialize(self):
        text = '> [!IMPORTANT]\n> line one\n> line two\n'
        blocks = parse_markdown_to_blocks(text)
        serialized = blocks_to_markdown(blocks)
        self.assertEqual(serialized, '::: important\nline one\nline two\n:::\n')

    def test_callout_fence_basic_parse(self):
        text = ':::  note\nhello world\n:::\n'
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(blocks[0].type, 'callout')
        self.assertEqual(blocks[0].calloutKind, 'note')
        self.assertEqual(blocks[0].text, 'hello world')

    def test_callout_fence_multiline_body(self):
        text = '::: warning\nline one\nline two\nline three\n:::\n'
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(blocks[0].calloutKind, 'warning')
        self.assertEqual(blocks[0].text, 'line one\nline two\nline three')

    def test_callout_fence_all_kinds_case_insensitive(self):
        for kind in ('note', 'tip', 'important', 'warning', 'caution', 'details'):
            blocks = parse_markdown_to_blocks('::: %s\nbody\n:::\n' % kind.upper())
            self.assertEqual(blocks[0].type, 'callout')
            self.assertEqual(blocks[0].calloutKind, kind)

    def test_callout_fence_empty_body(self):
        blocks = parse_markdown_to_blocks('::: note\n:::\n')
        self.assertEqual(blocks[0].type, 'callout')
        self.assertEqual(blocks[0].text, '')

    def test_callout_fence_two_adjacent_blocks_no_blank_line_needed(self):
        text = '::: note\nfirst\n:::\n::: tip\nsecond\n:::\n'
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(len(blocks), 2)
        self.assertEqual(blocks[0].calloutKind, 'note')
        self.assertEqual(blocks[0].text, 'first')
        self.assertEqual(blocks[1].calloutKind, 'tip')
        self.assertEqual(blocks[1].text, 'second')

    def test_callout_fence_unrecognized_kind_falls_back_to_paragraph(self):
        blocks = parse_markdown_to_blocks('::: foo\nbody\n:::\n')
        self.assertNotEqual(blocks[0].type, 'callout')

    def test_callout_fence_unclosed_at_eof(self):
        text = '::: note\nhello\n'
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(blocks[0].type, 'callout')
        self.assertEqual(blocks[0].text, 'hello')

    def test_callout_fence_custom_title_parsed(self):
        text = '::: warning STOP\nbody\n:::\n'
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(blocks[0].calloutKind, 'warning')
        self.assertEqual(blocks[0].calloutTitle, 'STOP')
        self.assertEqual(blocks[0].text, 'body')

    def test_callout_fence_no_title_leaves_calloutTitle_empty(self):
        blocks = parse_markdown_to_blocks('::: note\nbody\n:::\n')
        self.assertEqual(blocks[0].calloutTitle, '')

    def test_callout_fence_custom_title_serialized(self):
        from noteapp.markdown_blocks import Block
        block = Block('callout', text='body', calloutKind='warning', calloutTitle='STOP')
        serialized = blocks_to_markdown([block])
        self.assertEqual(serialized, '::: warning STOP\nbody\n:::\n')

    def test_callout_fence_no_title_serialized_without_suffix(self):
        from noteapp.markdown_blocks import Block
        block = Block('callout', text='body', calloutKind='note', calloutTitle='')
        serialized = blocks_to_markdown([block])
        self.assertEqual(serialized, '::: note\nbody\n:::\n')

    def test_callout_fence_custom_title_round_trip(self):
        text = '::: warning STOP\nline one\nline two\n:::\n'
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(blocks_to_markdown(blocks), text)

    def test_callout_legacy_syntax_has_no_title(self):
        blocks = parse_markdown_to_blocks('> [!NOTE]\n> hello\n')
        self.assertEqual(blocks[0].calloutTitle, '')

    def test_callout_details_nested_blocks_parsed(self):
        text = '::: details\n# Heading inside\nSome paragraph.\n:::\n'
        blocks = parse_markdown_to_blocks(text)
        details = blocks[0]
        self.assertEqual(details.calloutKind, 'details')
        self.assertEqual(len(details.children), 2)
        self.assertEqual(details.children[0].type, 'heading')
        self.assertEqual(details.children[0].text, 'Heading inside')
        self.assertEqual(details.children[1].type, 'paragraph')
        self.assertEqual(details.children[1].text, 'Some paragraph.')

    def test_callout_details_empty_body_gets_placeholder_paragraph(self):
        blocks = parse_markdown_to_blocks('::: details\n:::\n')
        details = blocks[0]
        self.assertEqual(len(details.children), 1)
        self.assertEqual(details.children[0].type, 'paragraph')
        self.assertEqual(details.children[0].text, '')

    def test_callout_details_nested_round_trip(self):
        text = '::: details Click to expand\n# Heading inside\nSome paragraph.\n:::\n'
        blocks = parse_markdown_to_blocks(text)
        self.assertEqual(blocks_to_markdown(blocks), text)

    def test_callout_details_balances_nested_fence(self):
        # A callout nested inside a "details" body must not be mistaken for
        # the details block's own closing fence.
        text = '::: details outer\n::: tip inner\nnested body\n:::\nafter nested\n:::\n'
        blocks = parse_markdown_to_blocks(text)
        details = blocks[0]
        self.assertEqual(details.calloutKind, 'details')
        self.assertEqual(len(details.children), 2)
        self.assertEqual(details.children[0].type, 'callout')
        self.assertEqual(details.children[0].calloutKind, 'tip')
        self.assertEqual(details.children[0].text, 'nested body')
        self.assertEqual(details.children[1].type, 'paragraph')
        self.assertEqual(details.children[1].text, 'after nested')

    def test_callout_non_details_kind_keeps_flat_text_model(self):
        blocks = parse_markdown_to_blocks('::: tip\nline one\nline two\n:::\n')
        self.assertEqual(blocks[0].children, [])
        self.assertEqual(blocks[0].text, 'line one\nline two')


if __name__ == '__main__':
    unittest.main()
