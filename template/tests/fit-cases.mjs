// What the name's fit is proved on (scripts/fit.mjs in a browser, tests/fit.test.ts without one): the
// widths a page is checked at, fictional names of 6 to 30 characters in Latin and Georgian, and prices.
export const WIDTHS = [320, 360, 390, 414, 600, 768, 1024, 1280];
export const NAMES = {
  latin: ['Bo Li Yu', 'Ada Wu', 'Elisabed Shabloni', 'Maximiliane von Hohenbruck-Aue', 'Zoë O’Brien-Smith', 'Łukasz Żółć', 'Åsa Björk', 'Madonna', 'Ana María López García', 'gigi jgharkava', 'Wolfgang Tyvärr', 'Ngô Bảo Châu'],
  georgian: ['ნია ხე', 'ელისაბედ შაბლონი', 'გიორგი მამისთვალიშვილი-ბაქრაძე', 'ჟუჟუნა წყალტუბოელი', 'თამარ ჯაყელი'],
};
export const PRICES = ['90 €', '1,500 ₾', '$12,500'];
