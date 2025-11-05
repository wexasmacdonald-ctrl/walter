const re = /^(\d+)[\-�?\"](\d+)(.*)$/;
console.log('dash', re.test('123-456 Main St'));
console.log('en dash', re.test('123–456 Main St'));
