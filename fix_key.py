import re
content = open('backend/main.py').read()
content = re.sub(r'gsk_[A-Za-z0-9]+', '', content)
open('backend/main.py', 'w').write(content)
print('Done! Key removed.')