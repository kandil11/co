#!/usr/bin/env python3
"""Parse RevisionSheet.docx and generate questions.js"""

import re
import json
from docx import Document

def parse_questions(docx_path):
    doc = Document(docx_path)
    
    # Collect all non-empty paragraph text
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    
    questions = []
    i = 0
    
    while i < len(paragraphs):
        text = paragraphs[i]
        
        # Pattern 1: Single paragraph with question + options + answer
        # e.g. "1. Question text\nA) opt1\nB) opt2\nC) opt3\nD) opt4\nAnswer: C"
        if re.search(r'\nA\)', text) and re.search(r'Answer:\s*[A-D]', text):
            q = parse_single_paragraph(text)
            if q:
                questions.append(q)
            i += 1
            continue
        
        # Pattern 2: Multi-paragraph question
        # Check if this looks like a question number or context start
        q_match = re.match(r'^(\d+[\.\)]\s+|Q\d+)', text)
        case_match = re.match(r'^Case\s+\d+', text, re.IGNORECASE)
        
        if q_match or case_match:
            # Gather paragraphs until we find one with Answer: X
            collected = [text]
            j = i + 1
            found_answer = False
            while j < len(paragraphs) and j < i + 20:  # safety limit
                collected.append(paragraphs[j])
                if re.search(r'Answer:\s*[A-D]', paragraphs[j]):
                    found_answer = True
                    j += 1
                    break
                j += 1
            
            if found_answer:
                q = parse_multi_paragraph(collected)
                if q:
                    questions.append(q)
                i = j
                continue
        
        # Skip non-question paragraphs (headers, context lines, etc.)
        i += 1
    
    return questions

def parse_single_paragraph(text):
    """Parse a question where everything is in one paragraph."""
    lines = text.split('\n')
    
    # Extract answer
    answer_match = re.search(r'Answer:\s*([A-D])', text)
    if not answer_match:
        return None
    answer_letter = answer_match.group(1)
    
    # Extract options
    options = {}
    option_pattern = re.compile(r'([A-D])\)\s*(.+?)(?=\s*[A-D]\)|$|\s*Answer:)', re.DOTALL)
    
    # Try line-by-line first
    for line in lines:
        opt_match = re.match(r'^([A-D])\)\s*(.+)', line.strip())
        if opt_match:
            options[opt_match.group(1)] = opt_match.group(2).strip()
    
    # If not found line-by-line, try inline
    if len(options) < 2:
        options = {}
        # Find the options block
        opts_text = text
        for m in re.finditer(r'([A-D])\)\s*', opts_text):
            letter = m.group(1)
            start = m.end()
            # Find the end of this option
            next_opt = re.search(r'[A-D]\)', opts_text[start:])
            answer_pos = opts_text.find('Answer:', start)
            if next_opt:
                end = start + next_opt.start()
            elif answer_pos > start:
                end = answer_pos
            else:
                end = len(opts_text)
            options[letter] = opts_text[start:end].strip().rstrip('\n')
    
    if len(options) < 2:
        return None
    
    # Extract question text (everything before the first option)
    first_opt = re.search(r'\n?[A-D]\)', text)
    if first_opt:
        question_text = text[:first_opt.start()].strip()
    else:
        return None
    
    # Clean question number prefix
    question_text = re.sub(r'^\d+[\.\)]\s*', '', question_text).strip()
    
    # Build options list maintaining order
    opts_list = []
    correct_index = -1
    for idx, letter in enumerate(['A', 'B', 'C', 'D']):
        if letter in options:
            opts_list.append(options[letter])
            if letter == answer_letter:
                correct_index = idx
    
    if correct_index == -1 or len(opts_list) < 2:
        return None
    
    # Extract explanation if present (text after Answer: X)
    explanation = None
    expl_match = re.search(r'Answer:\s*[A-D]\s*\n?\(?(.+?)\)?$', text, re.DOTALL)
    if expl_match:
        expl = expl_match.group(1).strip().strip('()')
        if expl and len(expl) > 1:
            explanation = expl
    
    result = {
        'question': question_text,
        'options': opts_list,
        'answer': correct_index,
    }
    if explanation:
        result['explanation'] = explanation
    
    return result

def parse_multi_paragraph(paragraphs):
    """Parse a question spread across multiple paragraphs."""
    full_text = '\n'.join(paragraphs)
    
    # Find answer
    answer_match = re.search(r'Answer:\s*([A-D])', full_text)
    if not answer_match:
        return None
    answer_letter = answer_match.group(1)
    
    # Find options - look for a paragraph or lines containing A) B) C) D)
    options = {}
    question_parts = []
    found_options = False
    
    for para in paragraphs:
        # Check if this paragraph contains options
        if re.search(r'[A-D]\)', para) and not found_options:
            # Parse options from this paragraph
            for line in para.split('\n'):
                opt_match = re.match(r'^([A-D])\)\s*(.+)', line.strip())
                if opt_match:
                    options[opt_match.group(1)] = opt_match.group(2).strip()
                    found_options = True
            
            # If options are inline
            if not found_options:
                for m in re.finditer(r'([A-D])\)\s*([^A-D\n]+?)(?=\s*[A-D]\)|$|\s*Answer:)', para):
                    options[m.group(1)] = m.group(2).strip()
                    found_options = True
            
            if not found_options:
                question_parts.append(para)
        elif re.match(r'^Answer:', para.strip()):
            pass  # skip answer line
        elif not found_options:
            question_parts.append(para)
    
    if len(options) < 2:
        return None
    
    # Build question text
    question_text = '\n'.join(question_parts).strip()
    
    # Clean leading question number
    question_text = re.sub(r'^(\d+[\.\)]\s*)', '', question_text)
    question_text = re.sub(r'^(Q\d+\s*[\.\)]?\s*)', '', question_text)
    # Clean "Case X" prefix - keep it as context
    
    # Build options list
    opts_list = []
    correct_index = -1
    for idx, letter in enumerate(['A', 'B', 'C', 'D']):
        if letter in options:
            opts_list.append(options[letter])
            if letter == answer_letter:
                correct_index = idx
    
    if correct_index == -1 or len(opts_list) < 2:
        return None
    
    # Extract explanation
    explanation = None
    expl_match = re.search(r'Answer:\s*[A-D]\s*\n?\(?(.+?)\)?$', full_text, re.DOTALL)
    if expl_match:
        expl = expl_match.group(1).strip().strip('()')
        if expl and len(expl) > 1:
            explanation = expl
    
    result = {
        'question': question_text.strip(),
        'options': opts_list,
        'answer': correct_index,
    }
    if explanation:
        result['explanation'] = explanation
    
    return result

def main():
    questions = parse_questions('RevisionSheet.docx')
    
    # Generate JS file
    js_content = "// Auto-generated from RevisionSheet.docx\n"
    js_content += f"// Total questions: {len(questions)}\n\n"
    js_content += "const QUESTIONS = " + json.dumps(questions, indent=2, ensure_ascii=False) + ";\n"
    
    with open('questions.js', 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    print(f"✅ Successfully parsed {len(questions)} questions → questions.js")
    
    # Quick validation
    for i, q in enumerate(questions):
        if not q['question'] or len(q['options']) < 2:
            print(f"  ⚠️  Question {i+1} may be incomplete: {q['question'][:50]}...")

if __name__ == '__main__':
    main()
