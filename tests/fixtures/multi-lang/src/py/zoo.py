from models import Animal


class Dog(Animal):
    def speak(self):
        return self.bark()

    def bark(self):
        return "woof"
