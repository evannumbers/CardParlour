import sys

if len(sys.argv) > 1:
    with open(sys.argv[1], 'wb') as f_out:
        for file in sys.argv[2:]:
            with open(file, 'rb') as f:
                f_out.write(f.read() + '\n')
