import urllib
import os

file_name = raw_input("Enter file name : ")

def get():
    for file in os.listdir('.'):
        if os.path.isfile(file) and file.startswith(file_name):
            print 'Currently Checking :', file
            read_text(file)

def read_text(file):
    handle = open(file)
    contents_of_file = handle.read()
    handle.close()
    check_profanity(contents_of_file)

def check_profanity(text_to_check):    
    connection = urllib.urlopen("http://www.purgomalum.com/service/containsprofanity?text=" + text_to_check)
    output = connection.read()    
    connection.close()

    if "true" in output:
        print "Profanity alert !"
    elif "false" in output:
        print "There are no curse words in this document."
    else :
        print "Could not scan the document properly."

if __name__ == '__main__':
    get()