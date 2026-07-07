package main

type Reader interface {
	Read(p []byte) (int, error)
}

type File struct {
	Name string
}
