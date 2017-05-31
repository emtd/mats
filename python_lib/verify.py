#!/usr/bin/env python

# Python 2/3 compatibility
from __future__ import print_function

import image_process as ip


if __name__ == '__main__':
    import sys, getopt
    opts, args = getopt.getopt(sys.argv[1:], '', ['feature='])
    opts = dict(opts)
    #feature_name = opts.get('--feature', 'brisk')
    fn1=fn2=fn3=None
    l=len(args)
    if(l<2):
        print("argument error!")
        sys.exit(1)
    elif(l==2):
        fn1,fn2=args
    elif(l==3):
        fn1, fn2, fn3 = args
    else:
        print("argument error!")
    region=None
    if(fn3 is not None):
        arr=fn3.split(',')
        if(len(arr)==4):
            region=ip.region(int(float(arr[0])),int(float(arr[1])),int(float(arr[2])),int(float(arr[3])))
    print((ip.get_feature_number_by_image(fn1,fn2,region)).replace(' ', ''))
