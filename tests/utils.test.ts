/**
 * Tests for utility functions
 */

import { describe, it, expect } from 'vitest';
import { Crypto, cosineSimilarity, extractDomain, cleanText } from '../lib/utils';

describe('Crypto', () => {
  it('should generate consistent SHA256 hashes', () => {
    const hash1 = Crypto.sha256('test');
    const hash2 = Crypto.sha256('test');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });
  
  it('should generate stable content IDs', () => {
    const obj = { a: 1, b: 2 };
    const id1 = Crypto.contentId(obj);
    const id2 = Crypto.contentId(obj);
    expect(id1).toBe(id2);
  });
  
  it('should generate different IDs for different objects', () => {
    const id1 = Crypto.contentId({ a: 1 });
    const id2 = Crypto.contentId({ a: 2 });
    expect(id1).not.toBe(id2);
  });
});

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });
  
  it('should return 0 for orthogonal vectors', () => {
    const v1 = [1, 0, 0];
    const v2 = [0, 1, 0];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(0, 5);
  });
  
  it('should handle negative correlation', () => {
    const v1 = [1, 2, 3];
    const v2 = [-1, -2, -3];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1, 5);
  });
});

describe('extractDomain', () => {
  it('should extract domain from URL', () => {
    expect(extractDomain('https://www.example.com/path')).toBe('example.com');
    expect(extractDomain('http://blog.example.com/post')).toBe('blog.example.com');
  });
  
  it('should handle invalid URLs', () => {
    expect(extractDomain('not-a-url')).toBe('unknown');
  });
});

describe('cleanText', () => {
  it('should normalize whitespace', () => {
    expect(cleanText('  hello   world  ')).toBe('hello world');
    expect(cleanText('hello\n\nworld')).toBe('hello world');
  });
});

